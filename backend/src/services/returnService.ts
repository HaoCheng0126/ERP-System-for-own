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
import { salaryDeductionService } from './salaryDeductionService';

type DeductionInput = {
  employeeId: string;
  quantity: number;
};

type ReturnItemInput = {
  productId: string;
  quantity: number;
  unitPrice?: number;
  restock?: boolean;
  // 多员工扣款（新版）
  deductions?: DeductionInput[];
  // 兼容旧版单员工字段
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
  // 查询某送货单已有退货单的累计退货数量（当前事务内已删除的订单不计）
  private async buildPriorReturnedMap(manager: EntityManager, deliveryOrderId: string): Promise<Map<string, number>> {
    const priorReturns = await manager.find(ReturnOrder, {
      where: { deliveryOrderId },
      relations: ['items'],
    });
    const map = new Map<string, number>();
    for (const ret of priorReturns) {
      for (const item of ret.items) {
        map.set(item.productId, (map.get(item.productId) || 0) + Number(item.quantity));
      }
    }
    return map;
  }

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

      // 已有其他退货单的累计退量（同一送货单可被多次退货，合计不超过已送）
      const priorReturnedByProduct = data.deliveryOrderId
        ? await this.buildPriorReturnedMap(manager, data.deliveryOrderId)
        : new Map<string, number>();

      // 本次请求内跨行累计（同一产品分多行时防重复）
      const returnedQtyByProduct = new Map<string, number>();
      const itemEntities: ReturnOrderItem[] = [];
      const deductions: { employeeId: string; amount: number; reason: string; quantity?: number; unitPrice?: number }[] = [];
      let totalAmount = 0;

      for (const raw of data.items) {
        const product = await this.getFinishedProduct(manager, raw.productId);
        const qty = roundQuantity(raw.quantity);
        if (qty <= 0) {
          throw new AppError('退货数量必须大于0', 400);
        }
        if (data.deliveryOrderId) {
          const delivered = deliveredQtyByProduct.get(raw.productId) || 0;
          const priorReturned = priorReturnedByProduct.get(raw.productId) || 0;
          const available = delivered - priorReturned;
          const alreadyReturned = returnedQtyByProduct.get(raw.productId) || 0;
          if (alreadyReturned + qty - available > 0.0001) {
            throw new AppError(
              `退货数量超过可退数量（${product.name} 已送 ${delivered}，已退 ${priorReturned}，剩余可退 ${roundQuantity(available - alreadyReturned)}）`,
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

        // 兼容新版（deductions[]）和旧版（deductEmployeeId/deductQuantity）
        const rawDeductions: DeductionInput[] =
          Array.isArray(raw.deductions) && raw.deductions.length > 0
            ? raw.deductions
            : raw.deductEmployeeId
              ? [{ employeeId: raw.deductEmployeeId, quantity: roundQuantity(raw.deductQuantity ?? qty) }]
              : [];

        // 校验：每条扣款的员工和数量
        for (const d of rawDeductions) {
          if (!d.employeeId) throw new AppError('扣款员工不能为空', 400);
          if (roundQuantity(d.quantity) <= 0) throw new AppError('退货扣款数量必须大于0', 400);
        }
        // 同一明细不允许同一员工重复扣款
        const seenEmployees = new Set<string>();
        for (const d of rawDeductions) {
          if (seenEmployees.has(d.employeeId)) throw new AppError('同一产品的扣款员工不能重复', 400);
          seenEmployees.add(d.employeeId);
        }
        // 扣款总量不能超过退货量
        const totalDeductQty = rawDeductions.reduce((sum, d) => sum + roundQuantity(d.quantity), 0);
        if (totalDeductQty > qty + 0.0001) {
          throw new AppError(`扣款数量合计（${roundQuantity(totalDeductQty)}）不能超过退货数量（${qty}）`, 400);
        }

        const deductEmployeeId = rawDeductions.length > 0 ? rawDeductions[0].employeeId : null;
        const deductQuantity = rawDeductions.length > 0 ? roundQuantity(rawDeductions[0].quantity) : 0;

        const item = manager.create(ReturnOrderItem, {
          productId: raw.productId,
          quantity: qty,
          unitPrice,
          amount,
          restock,
          deductEmployeeId,
          deductQuantity,
          deductInventoryRecordId: null,
          deductionCount: rawDeductions.length,
        });
        itemEntities.push(item);

        for (const d of rawDeductions) {
          const dQty = roundQuantity(d.quantity);
          const costPrice = Number(product.costPrice);
          deductions.push({
            employeeId: d.employeeId,
            amount: roundCurrencyAmount(dQty * costPrice),
            quantity: dQty,
            unitPrice: costPrice,
            reason: `退货扣款 ${returnNumber} · ${product.name}`,
          });
        }
      }

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

      // Create salary deductions after the return order exists (need its id)
      if (deductions.length > 0) {
        await salaryDeductionService.createBatchWithManager(manager, actorId, returnOrder.id, returnDate, deductions);
      }

      return manager.findOne(ReturnOrder, {
        where: { id: returnOrder.id },
        relations: ['customer', 'deliveryOrder', 'items', 'items.product', 'deductions', 'deductions.employee'],
      });
    });
  }

  async list() {
    return returnOrderRepository.find({
      relations: ['customer', 'deliveryOrder', 'items', 'items.product', 'deductions', 'deductions.employee'],
      order: { returnDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async getById(id: string) {
    const order = await returnOrderRepository.findOne({
      where: { id },
      relations: ['customer', 'deliveryOrder', 'items', 'items.product', 'deductions', 'deductions.employee'],
    });
    if (!order) {
      throw new AppError('退货单不存在', 404);
    }
    return order;
  }

  async update(id: string, actorId: string, data: CreateReturnInput) {
    if (!data.customerId) throw new AppError('请选择客户', 400);
    if (!Array.isArray(data.items) || data.items.length === 0) throw new AppError('请至少添加一条退货明细', 400);

    return AppDataSource.transaction(async (manager) => {
      const oldOrder = await manager.findOne(ReturnOrder, { where: { id }, relations: ['items'] });
      if (!oldOrder) throw new AppError('退货单不存在', 404);

      const returnNumber = oldOrder.returnNumber;

      for (const item of oldOrder.items) {
        if (item.restock) {
          await this.adjustFinishedStock(manager, item.productId, -Number(item.quantity), '当前库存不足，无法更新该退货单');
        }
        if (item.deductInventoryRecordId) {
          await manager.delete(InventoryRecord, { id: item.deductInventoryRecordId });
        }
      }
      await salaryDeductionService.deleteByReturnOrder(manager, id);
      await manager.delete(ReturnOrder, { id });

      const customer = await manager.findOne(Customer, { where: { id: data.customerId, type: CustomerType.CLIENT } });
      if (!customer) throw new AppError('客户不存在', 404);

      const deliveredQtyByProduct = new Map<string, number>();
      const deliveredPriceByProduct = new Map<string, number>();
      if (data.deliveryOrderId) {
        const deliveryOrder = await manager.findOne(DeliveryOrder, { where: { id: data.deliveryOrderId }, relations: ['items'] });
        if (!deliveryOrder || deliveryOrder.customerId !== customer.id) throw new AppError('关联送货单无效', 400);
        for (const di of deliveryOrder.items) {
          deliveredQtyByProduct.set(di.productId, (deliveredQtyByProduct.get(di.productId) || 0) + Number(di.quantity));
          if (!deliveredPriceByProduct.has(di.productId)) deliveredPriceByProduct.set(di.productId, Number(di.unitPrice));
        }
      }

      // 已有其他退货单的累计退量（当前事务已删旧单，所以不会被计入）
      const priorReturnedByProduct = data.deliveryOrderId
        ? await this.buildPriorReturnedMap(manager, data.deliveryOrderId)
        : new Map<string, number>();

      const returnDate = (typeof data.returnDate === 'string' && data.returnDate.trim()) || todayDateString();
      const returnedQtyByProduct = new Map<string, number>();
      const itemEntities: ReturnOrderItem[] = [];
      const deductions: { employeeId: string; amount: number; reason: string; quantity?: number; unitPrice?: number }[] = [];
      let totalAmount = 0;

      for (const raw of data.items) {
        const product = await this.getFinishedProduct(manager, raw.productId);
        const qty = roundQuantity(raw.quantity);
        if (qty <= 0) throw new AppError('退货数量必须大于0', 400);
        if (data.deliveryOrderId) {
          const delivered = deliveredQtyByProduct.get(raw.productId) || 0;
          const priorReturned = priorReturnedByProduct.get(raw.productId) || 0;
          const available = delivered - priorReturned;
          const alreadyReturned = returnedQtyByProduct.get(raw.productId) || 0;
          if (alreadyReturned + qty - available > 0.0001) {
            throw new AppError(
              `退货数量超过可退数量（${product.name} 已送 ${delivered}，已退 ${priorReturned}，剩余可退 ${roundQuantity(available - alreadyReturned)}）`,
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
        if (restock) await this.adjustFinishedStock(manager, raw.productId, qty);

        const rawDeductions: DeductionInput[] =
          Array.isArray(raw.deductions) && raw.deductions.length > 0
            ? raw.deductions
            : raw.deductEmployeeId
              ? [{ employeeId: raw.deductEmployeeId, quantity: roundQuantity(raw.deductQuantity ?? qty) }]
              : [];

        for (const d of rawDeductions) {
          if (!d.employeeId) throw new AppError('扣款员工不能为空', 400);
          if (roundQuantity(d.quantity) <= 0) throw new AppError('退货扣款数量必须大于0', 400);
        }
        const seenEmployees = new Set<string>();
        for (const d of rawDeductions) {
          if (seenEmployees.has(d.employeeId)) throw new AppError('同一产品的扣款员工不能重复', 400);
          seenEmployees.add(d.employeeId);
        }
        const totalDeductQty = rawDeductions.reduce((sum, d) => sum + roundQuantity(d.quantity), 0);
        if (totalDeductQty > qty + 0.0001) {
          throw new AppError(`扣款数量合计（${roundQuantity(totalDeductQty)}）不能超过退货数量（${qty}）`, 400);
        }

        const deductEmployeeId = rawDeductions.length > 0 ? rawDeductions[0].employeeId : null;
        const deductQuantity = rawDeductions.length > 0 ? roundQuantity(rawDeductions[0].quantity) : 0;

        itemEntities.push(manager.create(ReturnOrderItem, {
          productId: raw.productId, quantity: qty, unitPrice, amount, restock,
          deductEmployeeId, deductQuantity, deductInventoryRecordId: null,
          deductionCount: rawDeductions.length,
        }));

        for (const d of rawDeductions) {
          const dQty = roundQuantity(d.quantity);
          const costPrice = Number(product.costPrice);
          deductions.push({
            employeeId: d.employeeId,
            amount: roundCurrencyAmount(dQty * costPrice),
            quantity: dQty,
            unitPrice: costPrice,
            reason: `退货扣款 ${returnNumber} · ${product.name}`,
          });
        }
      }

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

      if (deductions.length > 0) {
        await salaryDeductionService.createBatchWithManager(manager, actorId, returnOrder.id, returnDate, deductions);
      }

      return manager.findOne(ReturnOrder, {
        where: { id: returnOrder.id },
        relations: ['customer', 'deliveryOrder', 'items', 'items.product', 'deductions', 'deductions.employee'],
      });
    });
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
          // 兼容旧版：删除关联的负数工资记录（老退货单）
          await manager.delete(InventoryRecord, { id: item.deductInventoryRecordId });
        }
      }

      // 新版：删除关联的扣款记录（salary_deductions）
      await salaryDeductionService.deleteByReturnOrder(manager, id);

      await manager.delete(ReturnOrder, { id });
      return true;
    });
  }
}

export const returnService = new ReturnService();
