import { AppDataSource } from '../config/database';
import {
  Customer,
  CustomerType,
  DeliveryOrder,
  InventoryRecord,
  Product,
  ProductType,
  ReturnOrder,
  ReturnOrderItem,
} from '../entities';
import type { EntityManager } from '../lib/typeorm';
import { AppError } from '../utils/AppError';
import { roundCurrencyAmount, roundLineAmount, roundQuantity, roundUnitPrice } from '../utils/decimal';
import { inventoryService } from './inventoryService';

type ReturnItemInput = {
  productId: string;
  quantity: number;
  unitPrice?: number;
  restock?: boolean;
  deductEmployeeId?: string | null;
  deductQuantity?: number;
};

type CreateReturnInput = {
  customerId: string;
  deliveryOrderId?: string | null;
  returnDate?: string;
  remark?: string | null;
  items: ReturnItemInput[];
};

const returnOrderRepository = AppDataSource.getRepository(ReturnOrder);

const todayDateString = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const normalizeRemark = (remark?: string | null) => {
  const trimmed = typeof remark === 'string' ? remark.trim() : '';
  return trimmed ? trimmed : null;
};

export class ReturnService {
  private async getFinishedProduct(manager: EntityManager, productId: string) {
    const product = await manager.findOne(Product, { where: { id: productId } });
    if (!product) {
      throw new AppError('退货产品不存在', 404);
    }
    if (product.type !== ProductType.FINISHED) {
      throw new AppError('退货只支持成品', 400);
    }
    return product;
  }

  private async adjustFinishedStock(
    manager: EntityManager,
    productId: string,
    deltaQuantity: number,
    errorMessage = '成品库存不足，无法完成退货操作',
  ) {
    const product = await this.getFinishedProduct(manager, productId);
    const nextStock = roundQuantity((Number(product.stock) || 0) + Number(deltaQuantity));
    if (nextStock < 0) {
      throw new AppError(errorMessage, 400);
    }
    product.stock = nextStock;
    await manager.save(product);
  }

  private async generateReturnNumber(manager: EntityManager, customerCode: string) {
    const now = new Date();
    const dateStr =
      now.getFullYear().toString().slice(2) +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0');
    const codeMatch = customerCode ? customerCode.match(/\d+/) : null;
    const codeDigits = codeMatch ? codeMatch[0] : '000';
    const prefix = `TH${dateStr}-${codeDigits}-`;
    // 按「日期+编号数字」前缀统计当日序号：不同客户但编号数字相同（如 C001 与 S001 都取到 001）
    // 也会拿到各自递增的序号，避免单号撞上唯一约束。
    const count = await manager
      .getRepository(ReturnOrder)
      .createQueryBuilder('ret')
      .where('ret.returnNumber LIKE :prefix', { prefix: `${prefix}%` })
      .getCount();
    const sequence = (count + 1).toString().padStart(3, '0');
    return `${prefix}${sequence}`;
  }

  async create(actorId: string, data: CreateReturnInput) {
    if (!data.customerId) {
      throw new AppError('请选择客户', 400);
    }
    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new AppError('请至少添加一条退货明细', 400);
    }

    return AppDataSource.transaction(async (manager) => {
      const customer = await manager.findOne(Customer, {
        where: { id: data.customerId, type: CustomerType.CLIENT },
      });
      if (!customer) {
        throw new AppError('客户不存在', 404);
      }

      // 关联送货单（可选）：用于校验退货数量 ≤ 已送数量，并带出默认单价
      const deliveredQtyByProduct = new Map<string, number>();
      const deliveredPriceByProduct = new Map<string, number>();
      if (data.deliveryOrderId) {
        const deliveryOrder = await manager.findOne(DeliveryOrder, {
          where: { id: data.deliveryOrderId },
          relations: ['items'],
        });
        if (!deliveryOrder || deliveryOrder.customerId !== customer.id) {
          throw new AppError('关联送货单无效', 400);
        }
        for (const di of deliveryOrder.items) {
          deliveredQtyByProduct.set(di.productId, (deliveredQtyByProduct.get(di.productId) || 0) + Number(di.quantity));
          if (!deliveredPriceByProduct.has(di.productId)) {
            deliveredPriceByProduct.set(di.productId, Number(di.unitPrice));
          }
        }
      }

      const returnNumber = await this.generateReturnNumber(manager, customer.code);
      const returnDate = (typeof data.returnDate === 'string' && data.returnDate.trim()) || todayDateString();

      // 跨明细行累计已退数量：同一产品分多行退货时，合计不得超过已送数量。
      const returnedQtyByProduct = new Map<string, number>();
      const itemEntities: ReturnOrderItem[] = [];
      const deductions: { employeeId: string; productId: string; quantity: number; remark: string }[] = [];
      const deductItemIndex: number[] = [];
      let totalAmount = 0;

      for (const raw of data.items) {
        const product = await this.getFinishedProduct(manager, raw.productId);
        const qty = roundQuantity(raw.quantity);
        if (qty <= 0) {
          throw new AppError('退货数量必须大于0', 400);
        }
        if (data.deliveryOrderId) {
          const delivered = deliveredQtyByProduct.get(raw.productId) || 0;
          const alreadyReturned = returnedQtyByProduct.get(raw.productId) || 0;
          if (alreadyReturned + qty - delivered > 0.0001) {
            throw new AppError(
              `退货数量超过已送数量（${product.name} 已送 ${delivered}，本次累计退 ${roundQuantity(alreadyReturned + qty)}）`,
              400,
            );
          }
          returnedQtyByProduct.set(raw.productId, alreadyReturned + qty);
        }

        const unitPrice =
          raw.unitPrice !== undefined && raw.unitPrice !== null
            ? roundUnitPrice(raw.unitPrice)
            : roundUnitPrice(deliveredPriceByProduct.get(raw.productId) ?? Number(product.basePrice || 0));
        const amount = roundLineAmount(qty, unitPrice);
        totalAmount += amount;

        const restock = raw.restock !== false;
        if (restock) {
          await this.adjustFinishedStock(manager, raw.productId, qty);
        }

        const deductEmployeeId = raw.deductEmployeeId || null;
        const deductQuantity = deductEmployeeId ? roundQuantity(raw.deductQuantity ?? qty) : 0;

        const item = manager.create(ReturnOrderItem, {
          productId: raw.productId,
          quantity: qty,
          unitPrice,
          amount,
          restock,
          deductEmployeeId,
          deductQuantity,
          deductInventoryRecordId: null,
        });
        itemEntities.push(item);

        if (deductEmployeeId) {
          if (deductQuantity <= 0) {
            throw new AppError('退货扣款数量必须大于0', 400);
          }
          deductions.push({
            employeeId: deductEmployeeId,
            productId: raw.productId,
            quantity: deductQuantity,
            remark: `退货扣款 ${returnNumber} · ${product.name}`,
          });
          deductItemIndex.push(itemEntities.length - 1);
        }
      }

      const deductionRecords = deductions.length
        ? await inventoryService.createReturnDeductionRecords(manager, actorId, deductions)
        : [];
      deductionRecords.forEach((record, index) => {
        itemEntities[deductItemIndex[index]].deductInventoryRecordId = record.id;
      });

      const returnOrder = manager.create(ReturnOrder, {
        returnNumber,
        customerId: customer.id,
        deliveryOrderId: data.deliveryOrderId || null,
        returnDate,
        totalAmount: roundCurrencyAmount(totalAmount),
        remark: normalizeRemark(data.remark),
        items: itemEntities,
      });
      await manager.save(returnOrder);

      return manager.findOne(ReturnOrder, {
        where: { id: returnOrder.id },
        relations: ['customer', 'deliveryOrder', 'items', 'items.product'],
      });
    });
  }

  async list() {
    return returnOrderRepository.find({
      relations: ['customer', 'deliveryOrder', 'items', 'items.product'],
      order: { returnDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async getById(id: string) {
    const order = await returnOrderRepository.findOne({
      where: { id },
      relations: ['customer', 'deliveryOrder', 'items', 'items.product'],
    });
    if (!order) {
      throw new AppError('退货单不存在', 404);
    }
    return order;
  }

  async delete(id: string) {
    return AppDataSource.transaction(async (manager) => {
      const order = await manager.findOne(ReturnOrder, { where: { id }, relations: ['items'] });
      if (!order) {
        throw new AppError('退货单不存在', 404);
      }

      for (const item of order.items) {
        if (item.restock) {
          // 回库的货删除退货单时要从库存里减回去
          await this.adjustFinishedStock(
            manager,
            item.productId,
            -Number(item.quantity),
            '当前库存不足，无法删除该退货单',
          );
        }
        if (item.deductInventoryRecordId) {
          // 删除关联的负数工资记录 → 本月工资自动恢复
          await manager.delete(InventoryRecord, { id: item.deductInventoryRecordId });
        }
      }

      await manager.delete(ReturnOrder, { id });
      return true;
    });
  }
}

export const returnService = new ReturnService();
