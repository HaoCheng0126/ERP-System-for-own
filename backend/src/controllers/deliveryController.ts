import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { DeliveryOrder, DeliveryOrderItem, DeliveryOrderStatus, Product, Customer, ProductPrice } from '../entities';
import { AppError } from '../utils/AppError';
import { AuthRequest } from '../middlewares/auth';
import { In } from '../lib/typeorm';
import { roundCurrencyAmount, roundLineAmount, roundQuantity, roundUnitPrice } from '../utils/decimal';

const deliveryOrderRepository = AppDataSource.getRepository(DeliveryOrder);
const deliveryOrderItemRepository = AppDataSource.getRepository(DeliveryOrderItem);
const productRepository = AppDataSource.getRepository(Product);
const customerRepository = AppDataSource.getRepository(Customer);
const productPriceRepository = AppDataSource.getRepository(ProductPrice);

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

export const getDeliveryOrders = async (req: AuthRequest, res: Response) => {
  try {
    const orders = await deliveryOrderRepository.find({
      relations: ['customer', 'items', 'items.product'],
      order: { createdAt: 'DESC' },
    });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error });
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

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error });
  }
};

export const createDeliveryOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { customerId, deliveryDate, items, remark } = req.body;

    const customer = await customerRepository.findOne({ where: { id: customerId } });
    if (!customer) {
      return res.status(404).json({ message: '客户不存在' });
    }

    const orderNumber = await generateOrderNumber(customerId, customer.code);

    const orderItems: DeliveryOrderItem[] = [];
    let totalAmount = 0;

    for (const itemData of items) {
      const product = await productRepository.findOne({ where: { id: itemData.productId } });
      if (!product) {
        return res.status(404).json({ message: `产品 ${itemData.productId} 不存在` });
      }

      const quantity = roundQuantity(itemData.quantity);
      let unitPrice = roundUnitPrice(product.basePrice || 0);
      
      const priceRecord = await productPriceRepository.findOne({
        where: { productId: itemData.productId, customerId },
        order: { createdAt: 'DESC' },
      });
      if (priceRecord) {
        unitPrice = roundUnitPrice(priceRecord.price);
      }

      if (itemData.unitPrice !== undefined) {
        unitPrice = roundUnitPrice(itemData.unitPrice);
      }

      const amount = roundLineAmount(quantity, unitPrice);
      totalAmount += amount;

      const orderItem = deliveryOrderItemRepository.create({
        productId: itemData.productId,
        quantity,
        unitPrice,
        amount,
      });
      orderItems.push(orderItem);
    }

    const order = deliveryOrderRepository.create({
      orderNumber,
      customerId,
      deliveryDate,
      totalAmount: roundCurrencyAmount(totalAmount),
      paidAmount: 0,
      remark,
      items: orderItems,
      status: DeliveryOrderStatus.PENDING,
    });

    await deliveryOrderRepository.save(order);

    const savedOrder = await deliveryOrderRepository.findOne({
      where: { id: order.id },
      relations: ['customer', 'items', 'items.product'],
    });

    res.status(201).json({ message: '送货单创建成功', order: savedOrder });
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error });
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
    res.status(500).json({ message: '服务器错误', error });
  }
};

export const updateDeliveryOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { customerId, deliveryDate, items, remark } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: '请至少添加一个产品' });
    }

    for (const item of items) {
      if (!item.productId || item.quantity === undefined) {
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
      const currentCustomerId = customerId || existingOrder.customerId;

      if (customerId) {
        const customer = await manager.findOne(Customer, { where: { id: customerId } });
        if (!customer) {
          throw new AppError('客户不存在', 404);
        }
      }

      let totalAmount = 0;
      const orderItems: DeliveryOrderItem[] = [];

      for (const itemData of items) {
        const product = await manager.findOne(Product, { where: { id: itemData.productId } });
        if (!product) {
          throw new AppError(`产品 ${itemData.productId} 不存在`, 404);
        }

        const quantity = roundQuantity(itemData.quantity);
        let unitPrice = roundUnitPrice(product.basePrice || 0);
        const priceRecord = await manager.getRepository(ProductPrice).findOne({
          where: { productId: itemData.productId, customerId: currentCustomerId },
          order: { createdAt: 'DESC' },
        });
        if (priceRecord) {
          unitPrice = roundUnitPrice(priceRecord.price);
        }
        if (itemData.unitPrice !== undefined) {
          unitPrice = roundUnitPrice(itemData.unitPrice);
        }

        const amount = roundLineAmount(quantity, unitPrice);
        totalAmount += amount;

        const orderItem = manager.create(DeliveryOrderItem, {
          deliveryOrderId: existingOrder.id,
          productId: itemData.productId,
          quantity,
          unitPrice,
          amount,
        });
        orderItems.push(orderItem);
      }

      await manager.delete(DeliveryOrderItem, { deliveryOrderId: existingOrder.id });

      existingOrder.customerId = currentCustomerId;
      existingOrder.deliveryDate = deliveryDate || existingOrder.deliveryDate;
      existingOrder.totalAmount = roundCurrencyAmount(totalAmount);
      if (remark !== undefined) {
        existingOrder.remark = remark;
      }
      existingOrder.items = orderItems;

      await manager.save(existingOrder);

      if (existingOrder.status === DeliveryOrderStatus.SETTLED) {
        existingOrder.paidAmount = roundCurrencyAmount(existingOrder.totalAmount);
      } else if (existingOrder.status === DeliveryOrderStatus.PARTIAL) {
        const maxPaid = Number(existingOrder.totalAmount);
        existingOrder.paidAmount = roundCurrencyAmount(Math.min(Number(existingOrder.paidAmount || 0), maxPaid));
      } else {
        existingOrder.paidAmount = 0;
      }

      await manager.save(existingOrder);

      return manager.findOne(DeliveryOrder, {
        where: { id: existingOrder.id },
        relations: ['customer', 'items', 'items.product'],
      });
    });

    res.json({ message: '送货单已更新', order: updatedOrder });
  } catch (error: any) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
    res.status(500).json({ message: '服务器错误', error });
  }
};

export const deleteDeliveryOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const order = await deliveryOrderRepository.findOne({ where: { id } });
    if (!order) {
      return res.status(404).json({ message: '送货单不存在' });
    }

    await AppDataSource.transaction(async (manager) => {
      await manager.delete(DeliveryOrderItem, { deliveryOrderId: id });
      await manager.delete(DeliveryOrder, { id });
    });

    res.json({ message: '送货单已删除' });
  } catch (error: any) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
    res.status(500).json({ message: '服务器错误', error });
  }
};
