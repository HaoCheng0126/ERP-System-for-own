import { Response } from 'express';
import { AppDataSource } from '../config/database';
import {
  DeliveryOrder,
  DeliveryOrderItem,
  DeliveryOrderStatus,
  Product,
  ProductType,
  Customer,
  CustomerType,
  ProductPrice,
  ReturnOrder,
} from '../entities';
import { AppError } from '../utils/AppError';
import { AuthRequest } from '../middlewares/auth';
import { recognizeDeliveryNote } from '../services/visionService';
import { In } from '../lib/typeorm';
import type { EntityManager } from '../lib/typeorm';
import { roundCurrencyAmount, roundLineAmount, roundQuantity, roundUnitPrice } from '../utils/decimal';
import { createProductWithManager } from './productController';
import { inventoryService } from '../services/inventoryService';

const deliveryOrderRepository = AppDataSource.getRepository(DeliveryOrder);
const customerRepository = AppDataSource.getRepository(Customer);

const getFinishedProductOrThrow = async (manager: EntityManager, productId: string) => {
  const product = await manager.findOne(Product, {
    where: { id: productId, isActive: true, type: ProductType.FINISHED },
  });
  if (!product) {
    throw new AppError('成品不存在或已停用', 404);
  }
  return product;
};

const adjustProductStock = async (
  manager: EntityManager,
  productId: string,
  deltaQuantity: number,
  errorMessage = '成品库存不足，无法创建送货单',
) => {
  const product = await getFinishedProductOrThrow(manager, productId);
  const nextStock = roundQuantity((Number(product.stock) || 0) + Number(deltaQuantity));
  if (nextStock < 0) {
    throw new AppError(errorMessage, 400);
  }
  product.stock = nextStock;
  await manager.save(product);
};

const generateOrderNumber = async (customerId: string, customerCode: string): Promise<string> => {
  const today = new Date();
  const dateStr = today.getFullYear().toString().slice(2) + 
    (today.getMonth() + 1).toString().padStart(2, '0') + 
    today.getDate().toString().padStart(2, '0');
  
  const todayStart = new Date(today.setHours(0, 0, 0, 0));
  const todayEnd = new Date(today.setHours(23, 59, 59, 999));
  
  const count = await deliveryOrderRepository
    .createQueryBuilder('order')
    .where('order.customerId = :customerId', { customerId })
    .andWhere('order.createdAt BETWEEN :start AND :end', { start: todayStart, end: todayEnd })
    .getCount();
  
  // Extract digits from customer code (e.g. "CUST001" -> "001")
  const codeMatch = customerCode.match(/\d+/);
  const codeDigits = codeMatch ? codeMatch[0] : '000';

  const sequence = (count + 1).toString().padStart(3, '0');
  return `${dateStr}-${codeDigits}-${sequence}`;
};

// 分配入库里「直接入库（不计工资）」的目标标识：只加库存、不生成入库单、不计任何员工工资。
const DIRECT_INBOUND = '__direct__';

// 处理库存不足时的分配入库：
//  - 选员工 → 生成已审批入库单（计入该员工计件工资）
//  - 直接入库(__direct__) → 仅加库存，不计任何人工资
// 合计必须覆盖缺口，否则抛错使整事务回滚。
const applyInboundAllocations = async (
  manager: EntityManager,
  actorId: string,
  productId: string,
  shortfall: number,
  rawAllocations: any[],
) => {
  let directQty = 0;
  const employeeAllocations: { submittedBy: string; productId: string; quantity: number }[] = [];
  for (const raw of rawAllocations) {
    const quantity = roundQuantity(raw.quantity);
    if (!(quantity > 0)) {
      throw new AppError('分配入库数量必须大于0', 400);
    }
    if (!raw.employeeId) {
      throw new AppError('请选择分配方式（员工或直接入库）', 400);
    }
    if (raw.employeeId === DIRECT_INBOUND) {
      directQty = roundQuantity(directQty + quantity);
    } else {
      employeeAllocations.push({ submittedBy: raw.employeeId, productId, quantity });
    }
  }
  const allocated = roundQuantity(
    directQty + employeeAllocations.reduce((sum, allocation) => sum + allocation.quantity, 0),
  );
  if (allocated < shortfall) {
    throw new AppError(`分配入库数量不足以覆盖缺口（缺 ${shortfall}，已分配 ${allocated}）`, 400);
  }
  if (directQty > 0) {
    // 直接入库：生成一条「直接入库（不计工资）」入库单记录（顺带加库存），可在入库单管理里查/删纠错。
    await inventoryService.createDirectInboundRecords(manager, actorId, [{ productId, quantity: directQty }]);
  }
  if (employeeAllocations.length > 0) {
    await inventoryService.createApprovedRecordsWithManager(manager, actorId, employeeAllocations);
  }
};

// 把本单为某客户登记的成品单价回写到「客户专属单价」(product_prices)，让产品管理能看到、下次自动带出。
const upsertCustomerPrice = async (
  manager: EntityManager,
  productId: string,
  customerId: string,
  price: number,
) => {
  if (price < 0) return;
  const repo = manager.getRepository(ProductPrice);
  const existing = await repo.findOne({ where: { productId, customerId } });
  if (existing) {
    if (roundUnitPrice(existing.price) !== price) {
      existing.price = price;
      await repo.save(existing);
    }
  } else {
    await repo.save(repo.create({ productId, customerId, price }));
  }
};

// 批量查退货合计，注入 returnedAmount 字段，避免 N+1
const attachReturnedAmounts = async (orders: DeliveryOrder[]) => {
  if (orders.length === 0) return orders;
  const rows = await AppDataSource.getRepository(ReturnOrder)
    .createQueryBuilder('r')
    .select('r.deliveryOrderId', 'deliveryOrderId')
    .addSelect('SUM(r.totalAmount)', 'total')
    .where('r.deliveryOrderId IS NOT NULL')
    .groupBy('r.deliveryOrderId')
    .getRawMany<{ deliveryOrderId: string; total: string }>();
  const map = new Map(rows.map((r) => [r.deliveryOrderId, Number(r.total)]));
  return orders.map((o) => ({ ...o, returnedAmount: map.get(o.id) ?? 0 }));
};

export const getDeliveryOrders = async (req: AuthRequest, res: Response) => {
  try {
    const orders = await deliveryOrderRepository.find({
      relations: ['customer', 'items', 'items.product'],
      order: { createdAt: 'DESC' },
    });
    res.json(await attachReturnedAmounts(orders));
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

export const getDeliveryOrderById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const order = await deliveryOrderRepository.findOne({
      where: { id },
      relations: ['customer', 'items', 'items.product'],
    });

    if (!order) {
      return res.status(404).json({ message: '送货单不存在' });
    }

    const [withAmount] = await attachReturnedAmounts([order]);
    res.json(withAmount);
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

export const createDeliveryOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { customerId, deliveryDate, items, remark } = req.body;

    if (!req.user) {
      return res.status(401).json({ message: '未认证' });
    }
    const actorId = req.user.id;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: '请至少添加一个产品' });
    }

    const customer = await customerRepository.findOne({ where: { id: customerId, type: CustomerType.CLIENT } });
    if (!customer) {
      return res.status(404).json({ message: '客户不存在' });
    }

    const orderNumber = await generateOrderNumber(customerId, customer.code);

    const savedOrder = await AppDataSource.transaction(async (manager) => {
      const orderItems: DeliveryOrderItem[] = [];
      let totalAmount = 0;

      for (const itemData of items) {
        // 1) 解析产品；支持内联新建产品（自动写入产品管理）
        let productId: string | undefined = itemData.productId;
        let newProductPrice: number | undefined;
        if (itemData.newProduct) {
          const created = await createProductWithManager(manager, {
            name: itemData.newProduct.name,
            specification: itemData.newProduct.specification,
            unit: itemData.newProduct.unit,
            type: ProductType.FINISHED,
            basePrice: itemData.newProduct.unitPrice,
            costPrice: 0,
            stock: 0,
          });
          productId = created.id;
          newProductPrice = roundUnitPrice(itemData.newProduct.unitPrice);
        }

        if (!productId || itemData.quantity === undefined) {
          throw new AppError('产品ID和数量为必填项', 400);
        }

        const product = await getFinishedProductOrThrow(manager, productId);
        const quantity = roundQuantity(itemData.quantity);
        if (quantity <= 0) {
          throw new AppError('数量必须大于0', 400);
        }

        // 2) 现场分配入库：库存不足时分配先入库（选员工计工资 / 直接入库不计工资），随后出库即送出
        if (Array.isArray(itemData.inboundAllocations) && itemData.inboundAllocations.length > 0) {
          const currentStock = roundQuantity(Number(product.stock) || 0);
          const shortfall = roundQuantity(Math.max(0, quantity - currentStock));
          await applyInboundAllocations(manager, actorId, productId, shortfall, itemData.inboundAllocations);
        }

        // 3) 定价：新建产品用其送货单价；否则 basePrice → 客户专属价 → 显式覆盖
        let unitPrice = newProductPrice ?? roundUnitPrice(product.basePrice || 0);
        if (newProductPrice === undefined) {
          const priceRecord = await manager.getRepository(ProductPrice).findOne({
            where: { productId, customerId },
            order: { createdAt: 'DESC' },
          });
          if (priceRecord) {
            unitPrice = roundUnitPrice(priceRecord.price);
          }
        }
        if (itemData.unitPrice !== undefined) {
          unitPrice = roundUnitPrice(itemData.unitPrice);
        }
        if (unitPrice < 0) {
          throw new AppError('单价不能小于0', 400);
        }

        // 回写客户专属单价，让产品管理可见、下次自动带出
        await upsertCustomerPrice(manager, productId, customerId, unitPrice);

        const amount = roundLineAmount(quantity, unitPrice);
        totalAmount += amount;

        // 4) 出库扣减（分配入库后净效果=送出）；若仍不足，原校验抛错使整事务回滚
        await adjustProductStock(manager, productId, -quantity);

        const orderItem = manager.create(DeliveryOrderItem, {
          productId,
          quantity,
          unitPrice,
          amount,
        });
        orderItems.push(orderItem);
      }

      const order = manager.create(DeliveryOrder, {
        orderNumber,
        customerId,
        deliveryDate,
        totalAmount: roundCurrencyAmount(totalAmount),
        paidAmount: 0,
        remark,
        items: orderItems,
        status: DeliveryOrderStatus.PENDING,
        stockDeducted: true,
      });

      await manager.save(order);

      return manager.findOne(DeliveryOrder, {
        where: { id: order.id },
        relations: ['customer', 'items', 'items.product'],
      });
    });

    res.status(201).json({ message: '送货单创建成功', order: savedOrder });
  } catch (error: any) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
    res.status(500).json({ message: '服务器错误' });
  }
};

export const updateDeliveryOrderStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { ids, status, paidAmount } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: '请提供送货单ID列表' });
    }

    if (!Object.values(DeliveryOrderStatus).includes(status)) {
      return res.status(400).json({ message: '无效的状态' });
    }

    if (status === DeliveryOrderStatus.PARTIAL && ids.length !== 1) {
      return res.status(400).json({ message: '部分结算只能对单笔订单操作' });
    }

    if (status === DeliveryOrderStatus.PARTIAL) {
      const order = await deliveryOrderRepository.findOne({ where: { id: ids[0] } });
      if (!order) {
        return res.status(404).json({ message: '送货单不存在' });
      }
      if (paidAmount === undefined || paidAmount === null || Number.isNaN(Number(paidAmount))) {
        return res.status(400).json({ message: '请填写已付金额' });
      }
      const paid = Number(paidAmount);
      if (paid < 0) {
        return res.status(400).json({ message: '已付金额不能小于0' });
      }
      if (paid >= Number(order.totalAmount)) {
        order.status = DeliveryOrderStatus.SETTLED;
        order.paidAmount = Number(order.totalAmount);
      } else {
        order.status = DeliveryOrderStatus.PARTIAL;
        order.paidAmount = paid;
      }
      await deliveryOrderRepository.save(order);
      return res.json({ message: '送货单状态已更新' });
    }

    if (status === DeliveryOrderStatus.SETTLED) {
      const orders = await deliveryOrderRepository.findBy({ id: In(ids) });
      for (const order of orders) {
        order.status = DeliveryOrderStatus.SETTLED;
        order.paidAmount = Number(order.totalAmount);
      }
      await deliveryOrderRepository.save(orders);
      return res.json({ message: '送货单状态已更新' });
    }

    if (status === DeliveryOrderStatus.PENDING) {
      const orders = await deliveryOrderRepository.findBy({ id: In(ids) });
      for (const order of orders) {
        order.status = DeliveryOrderStatus.PENDING;
        order.paidAmount = 0;
      }
      await deliveryOrderRepository.save(orders);
      return res.json({ message: '送货单状态已更新' });
    }

    res.json({ message: '送货单状态已更新' });
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

export const updateDeliveryOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { customerId, deliveryDate, items, remark } = req.body;

    if (!req.user) {
      return res.status(401).json({ message: '未认证' });
    }
    const actorId = req.user.id;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: '请至少添加一个产品' });
    }

    for (const item of items) {
      if ((!item.productId && !item.newProduct) || item.quantity === undefined) {
        return res.status(400).json({ message: '产品ID和数量为必填项' });
      }
      if (item.quantity <= 0) {
        return res.status(400).json({ message: '数量必须大于0' });
      }
    }

    const existingOrder = await deliveryOrderRepository.findOne({ where: { id } });
    if (!existingOrder) {
      return res.status(404).json({ message: '送货单不存在' });
    }

    const updatedOrder = await AppDataSource.transaction(async (manager) => {
      const existingOrderInTransaction = await manager.findOne(DeliveryOrder, {
        where: { id },
        relations: ['items'],
      });
      if (!existingOrderInTransaction) {
        throw new AppError('送货单不存在', 404);
      }

      // 已有关联退货单的送货单禁止编辑：退货按 customerId 冲减应收，若此处改小/改动送货金额，
      // 退货单会变成悬空引用且仍在冲减，导致应收为负、对账错乱。须先删退货单。
      const linkedReturnCount = await manager.count(ReturnOrder, { where: { deliveryOrderId: id } });
      if (linkedReturnCount > 0) {
        throw new AppError('该送货单已有关联退货单，请先删除对应退货单后再编辑', 400);
      }

      const currentCustomerId = customerId || existingOrderInTransaction.customerId;

      if (customerId) {
        const customer = await manager.findOne(Customer, { where: { id: customerId, type: CustomerType.CLIENT } });
        if (!customer) {
          throw new AppError('客户不存在', 404);
        }
      }

      if (existingOrderInTransaction.stockDeducted) {
        for (const oldItem of existingOrderInTransaction.items || []) {
          await adjustProductStock(manager, oldItem.productId, Number(oldItem.quantity));
        }
      }

      let totalAmount = 0;
      const orderItems: DeliveryOrderItem[] = [];

      for (const itemData of items) {
        let productId: string | undefined = itemData.productId;
        let newProductPrice: number | undefined;
        if (itemData.newProduct) {
          const created = await createProductWithManager(manager, {
            name: itemData.newProduct.name,
            specification: itemData.newProduct.specification,
            unit: itemData.newProduct.unit,
            type: ProductType.FINISHED,
            basePrice: itemData.newProduct.unitPrice,
            costPrice: 0,
            stock: 0,
          });
          productId = created.id;
          newProductPrice = roundUnitPrice(itemData.newProduct.unitPrice);
        }

        if (!productId || itemData.quantity === undefined) {
          throw new AppError('产品ID和数量为必填项', 400);
        }

        const product = await getFinishedProductOrThrow(manager, productId);
        const quantity = roundQuantity(itemData.quantity);
        if (quantity <= 0) {
          throw new AppError('数量必须大于0', 400);
        }

        let unitPrice = newProductPrice ?? roundUnitPrice(product.basePrice || 0);
        if (newProductPrice === undefined) {
          const priceRecord = await manager.getRepository(ProductPrice).findOne({
            where: { productId, customerId: currentCustomerId },
            order: { createdAt: 'DESC' },
          });
          if (priceRecord) {
            unitPrice = roundUnitPrice(priceRecord.price);
          }
        }
        if (itemData.unitPrice !== undefined) {
          unitPrice = roundUnitPrice(itemData.unitPrice);
        }
        if (unitPrice < 0) {
          throw new AppError('单价不能小于0', 400);
        }

        // 回写客户专属单价，让产品管理可见、下次自动带出
        await upsertCustomerPrice(manager, productId, currentCustomerId, unitPrice);

        const amount = roundLineAmount(quantity, unitPrice);
        totalAmount += amount;

        if (existingOrderInTransaction.stockDeducted) {
          // 编辑态分配入库：旧明细已在上方全额加回库存，此处按反扣后的实时库存计算缺口，
          // 只为新增缺口再分配（生成入库单并计入员工工资），不回滚旧分配记录。
          if (Array.isArray(itemData.inboundAllocations) && itemData.inboundAllocations.length > 0) {
            const currentStock = roundQuantity(Number(product.stock) || 0);
            const shortfall = roundQuantity(Math.max(0, quantity - currentStock));
            await applyInboundAllocations(manager, actorId, productId, shortfall, itemData.inboundAllocations);
          }
          await adjustProductStock(manager, productId, -quantity);
        }

        const orderItem = manager.create(DeliveryOrderItem, {
          deliveryOrderId: existingOrderInTransaction.id,
          productId,
          quantity,
          unitPrice,
          amount,
        });
        orderItems.push(orderItem);
      }

      await manager.delete(DeliveryOrderItem, { deliveryOrderId: existingOrderInTransaction.id });

      existingOrderInTransaction.customerId = currentCustomerId;
      existingOrderInTransaction.deliveryDate = deliveryDate || existingOrderInTransaction.deliveryDate;
      existingOrderInTransaction.totalAmount = roundCurrencyAmount(totalAmount);
      if (remark !== undefined) {
        existingOrderInTransaction.remark = remark;
      }
      existingOrderInTransaction.items = orderItems;

      await manager.save(existingOrderInTransaction);

      if (existingOrderInTransaction.status === DeliveryOrderStatus.SETTLED) {
        existingOrderInTransaction.paidAmount = roundCurrencyAmount(existingOrderInTransaction.totalAmount);
      } else if (existingOrderInTransaction.status === DeliveryOrderStatus.PARTIAL) {
        const maxPaid = Number(existingOrderInTransaction.totalAmount);
        existingOrderInTransaction.paidAmount = roundCurrencyAmount(Math.min(Number(existingOrderInTransaction.paidAmount || 0), maxPaid));
      } else {
        existingOrderInTransaction.paidAmount = 0;
      }

      await manager.save(existingOrderInTransaction);

      return manager.findOne(DeliveryOrder, {
        where: { id: existingOrderInTransaction.id },
        relations: ['customer', 'items', 'items.product'],
      });
    });

    res.json({ message: '送货单已更新', order: updatedOrder });
  } catch (error: any) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
    res.status(500).json({ message: '服务器错误' });
  }
};

export const deleteDeliveryOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const order = await deliveryOrderRepository.findOne({ where: { id }, relations: ['items'] });
    if (!order) {
      return res.status(404).json({ message: '送货单不存在' });
    }

    await AppDataSource.transaction(async (manager) => {
      // 已有关联退货单时禁止删除：退货单的外键为 SET NULL，删送货单会把退货单变成悬空记录，
      // 但退货仍按 customerId 冲减应收，导致应收为负、库存出现幽灵差额。须先删退货单。
      const linkedReturnCount = await manager.count(ReturnOrder, { where: { deliveryOrderId: id } });
      if (linkedReturnCount > 0) {
        throw new AppError('该送货单已有关联退货单，请先删除对应退货单后再删除', 400);
      }
      if (order.stockDeducted) {
        for (const item of order.items || []) {
          await adjustProductStock(manager, item.productId, Number(item.quantity));
        }
      }
      await manager.delete(DeliveryOrderItem, { deliveryOrderId: id });
      await manager.delete(DeliveryOrder, { id });
    });

    res.json({ message: '送货单已删除' });
  } catch (error: any) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
    res.status(500).json({ message: '服务器错误' });
  }
};

// 图像识别送货单：返回结构化草稿供前端回填，用户二次编辑后再正式创建。
export const recognizeDelivery = async (req: AuthRequest, res: Response) => {
  try {
    const { image } = req.body || {};
    if (!image || typeof image !== 'string') {
      throw new AppError('请提供送货单图片', 400);
    }
    // 仅接受 base64 的 data URL，禁止传入 http(s) 等地址，避免让视觉接口替我们去抓任意 URL（二阶 SSRF）。
    if (!image.startsWith('data:image/')) {
      throw new AppError('图片格式无效，请提供 base64 编码的图片（data:image/...）', 400);
    }
    const result = await recognizeDeliveryNote(image);
    res.json(result);
  } catch (error: any) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
    console.error(error);
    res.status(500).json({ message: '识别失败，请稍后重试' });
  }
};
