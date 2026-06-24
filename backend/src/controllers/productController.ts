import { Response } from 'express';
import { AppDataSource } from '../config/database';
import {
  Product,
  ProductType,
  ProductPrice,
  Customer,
  CustomerType,
  DeliveryOrder,
  DeliveryOrderStatus,
  DeliveryOrderItem,
  InventoryRecord,
  PurchaseOrder,
  StockAdjustment,
  StockAdjustmentReason,
  UserRole,
} from '../entities';
import { AuthRequest } from '../middlewares/auth';
import { AppError } from '../utils/AppError';
import type { EntityManager } from '../lib/typeorm';
import { roundCurrencyAmount, roundLineAmount, roundQuantity, roundUnitPrice } from '../utils/decimal';

type CreateProductData = {
  name?: string;
  specification?: string;
  unit?: string;
  type?: ProductType;
  costPrice?: number;
  basePrice?: number | null;
  stock?: number;
};

// 在调用方提供的事务 manager 内创建产品，供送货单/入库单内联新建产品复用。
// 校验必填项、产品类型、初始库存，并按「名称 + 规格」去重，避免误建重复产品。
export const createProductWithManager = async (
  manager: EntityManager,
  data: CreateProductData,
): Promise<Product> => {
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const specification = typeof data.specification === 'string' ? data.specification.trim() : '';
  const unit = typeof data.unit === 'string' ? data.unit.trim() : '';
  if (!name || !specification || !unit) {
    throw new AppError('产品名称、规格、单位为必填项', 400);
  }

  const type = data.type || ProductType.FINISHED;
  if (!Object.values(ProductType).includes(type)) {
    throw new AppError('产品类型无效', 400);
  }

  const stock = data.stock === undefined ? 0 : roundQuantity(data.stock);
  if (stock < 0) {
    throw new AppError('初始库存必须大于等于0', 400);
  }

  const existing = await manager.findOne(Product, {
    where: { name, specification, isActive: true },
  });
  if (existing) {
    throw new AppError(`产品「${name} - ${specification}」已存在，请直接选择`, 400);
  }

  const product = manager.create(Product, {
    name,
    specification,
    unit,
    type,
    costPrice: roundUnitPrice(data.costPrice),
    basePrice: data.basePrice === undefined || data.basePrice === null ? null : roundUnitPrice(data.basePrice),
    stock,
  });
  await manager.save(product);
  return product;
};

const productRepository = AppDataSource.getRepository(Product);
const productPriceRepository = AppDataSource.getRepository(ProductPrice);
const customerRepository = AppDataSource.getRepository(Customer);
const inventoryRecordRepository = AppDataSource.getRepository(InventoryRecord);
const deliveryOrderItemRepository = AppDataSource.getRepository(DeliveryOrderItem);
const purchaseOrderRepository = AppDataSource.getRepository(PurchaseOrder);

export const getProducts = async (req: AuthRequest, res: Response) => {
  try {
    const requestedType = typeof req.query.type === 'string' ? req.query.type : undefined;
    const typeFilter = Object.values(ProductType).includes(requestedType as ProductType)
      ? requestedType as ProductType
      : undefined;
    const where = {
      isActive: true,
      ...(typeFilter ? { type: typeFilter } : {}),
    };

    const products = await productRepository.find({
      where: req.user?.role === UserRole.PIECE_RATE ? { isActive: true, type: ProductType.FINISHED } : where,
      order: { createdAt: 'DESC' },
    });

    if (req.user?.role === UserRole.PIECE_RATE) {
      return res.json(products.map((product) => ({
        id: product.id,
        name: product.name,
        specification: product.specification,
        unit: product.unit,
        type: product.type,
        isActive: product.isActive,
      })));
    }

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

export const getProductById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const product = await productRepository.findOne({ 
      where: { id },
      relations: ['productPrices'],
    });
    
    if (!product) {
      return res.status(404).json({ message: '产品不存在' });
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

export const getProductBySpecification = async (req: AuthRequest, res: Response) => {
  try {
    const { specification } = req.params;
    const product = await productRepository.findOne({ 
      where: { specification, isActive: true },
    });
    
    if (!product) {
      return res.status(404).json({ message: '产品不存在' });
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

export const createProduct = async (req: AuthRequest, res: Response) => {
  try {
    const product = await AppDataSource.transaction((manager) =>
      createProductWithManager(manager, req.body),
    );
    res.status(201).json({ message: '产品创建成功', product });
  } catch (error: any) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: '服务器错误' });
  }
};

export const updateProduct = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const nextStock = req.body.stock !== undefined ? roundQuantity(req.body.stock) : undefined;
    if (nextStock !== undefined && nextStock < 0) {
      return res.status(400).json({ message: '库存不能小于0' });
    }
    if (req.body.type !== undefined && !Object.values(ProductType).includes(req.body.type)) {
      return res.status(400).json({ message: '产品类型无效' });
    }

    const product = await AppDataSource.transaction(async (manager) => {
      const productInTransaction = await manager.findOne(Product, { where: { id } });
      if (!productInTransaction) {
        return null;
      }

      if (req.body.type !== undefined && req.body.type !== productInTransaction.type) {
        const [inventoryCount, deliveryCount, purchaseCount] = await Promise.all([
          manager.count(InventoryRecord, { where: { productId: id } }),
          manager.count(DeliveryOrderItem, { where: { productId: id } }),
          manager.count(PurchaseOrder, { where: { productId: id } }),
        ]);
        if (inventoryCount + deliveryCount + purchaseCount > 0) {
          throw new Error('该产品已有业务记录，不能修改产品类型');
        }
      }

      const previousStock = Number(productInTransaction.stock || 0);
      const { stockAdjustmentRemark, ...productUpdate } = req.body;
      manager.merge(Product, productInTransaction, productUpdate);
      if (req.body.costPrice !== undefined) {
        productInTransaction.costPrice = roundUnitPrice(req.body.costPrice);
      }
      if (req.body.basePrice !== undefined) {
        productInTransaction.basePrice = req.body.basePrice === null ? null : roundUnitPrice(req.body.basePrice);
      }
      if (nextStock !== undefined) {
        productInTransaction.stock = nextStock;
      }

      await manager.save(productInTransaction);

      if (nextStock !== undefined && Math.abs(previousStock - nextStock) > 0.0001) {
        const adjustment = manager.create(StockAdjustment, {
          productId: productInTransaction.id,
          adjustedBy: req.user?.id || null,
          previousStock,
          deltaQuantity: roundQuantity(nextStock - previousStock),
          nextStock,
          reason: StockAdjustmentReason.MANUAL_CORRECTION,
          remark: typeof stockAdjustmentRemark === 'string' && stockAdjustmentRemark.trim()
            ? stockAdjustmentRemark.trim()
            : null,
        });
        await manager.save(adjustment);
      }

      return productInTransaction;
    });

    if (!product) {
      return res.status(404).json({ message: '产品不存在' });
    }

    res.json({ message: '产品更新成功', product });
  } catch (error: any) {
    if (error?.message === '该产品已有业务记录，不能修改产品类型') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: '服务器错误' });
  }
};

export const deleteProduct = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const product = await productRepository.findOne({ where: { id } });
    
    if (!product) {
      return res.status(404).json({ message: '产品不存在' });
    }

    // 检查是否存在关联的入库记录
    const hasInventoryRecords = await inventoryRecordRepository.count({ where: { productId: id } });
    if (hasInventoryRecords > 0) {
      return res.status(400).json({ message: '该产品存在入库记录，无法删除' });
    }

    // 检查是否存在关联的送货单
    const hasDeliveryItems = await deliveryOrderItemRepository.count({ where: { productId: id } });
    if (hasDeliveryItems > 0) {
      return res.status(400).json({ message: '该产品存在送货记录，无法删除' });
    }

    const hasPurchaseOrders = await purchaseOrderRepository.count({ where: { productId: id } });
    if (hasPurchaseOrders > 0) {
      return res.status(400).json({ message: '该产品存在进货记录，无法删除' });
    }

    product.isActive = false;
    await productRepository.save(product);
    res.json({ message: '产品已删除' });
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

export const getProductPrices = async (req: AuthRequest, res: Response) => {
  try {
    const { productId } = req.params;
    const prices = await productPriceRepository.find({
      where: { productId },
      relations: ['customer'],
    });
    res.json(prices);
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

export const getProductPriceForCustomer = async (req: AuthRequest, res: Response) => {
  try {
    const { productId, customerId } = req.params;
    
    let priceRecord = await productPriceRepository.findOne({
      where: { productId, customerId },
      order: { createdAt: 'DESC' },
    });

    if (!priceRecord) {
      // Check last delivery order item price
      const lastDeliveryItem = await deliveryOrderItemRepository.findOne({
        where: { 
          productId, 
          deliveryOrder: { customerId } 
        },
        relations: ['deliveryOrder'],
        order: { createdAt: 'DESC' }
      });

      if (lastDeliveryItem) {
        return res.json({ price: lastDeliveryItem.unitPrice, source: 'history' });
      }

      const product = await productRepository.findOne({ where: { id: productId } });
      if (product && product.basePrice) {
        return res.json({ price: product.basePrice, source: 'base' });
      }
      return res.status(404).json({ message: '未找到价格' });
    }

    res.json({ ...priceRecord, source: 'fixed' });
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

export const setProductPriceForCustomer = async (req: AuthRequest, res: Response) => {
  try {
    const { productId, customerId } = req.params;
    const { price } = req.body;
    const normalizedPrice = roundUnitPrice(price);

    const product = await productRepository.findOne({ where: { id: productId } });
    const customer = await customerRepository.findOne({ where: { id: customerId } });

    if (!product || !customer) {
      return res.status(404).json({ message: '产品或客户不存在' });
    }
    if (product.type !== ProductType.FINISHED) {
      return res.status(400).json({ message: '只有成品可以设置客户送货单价' });
    }
    if (customer.type !== CustomerType.CLIENT) {
      return res.status(400).json({ message: '客户送货单价只能设置给客户' });
    }

    let priceRecord = await productPriceRepository.findOne({
      where: { productId, customerId },
    });

    if (priceRecord) {
      priceRecord.price = normalizedPrice;
    } else {
      priceRecord = productPriceRepository.create({
        productId,
        customerId,
        price: normalizedPrice,
      });
    }

    await productPriceRepository.save(priceRecord);

    // Update pending delivery orders for this customer and product
    const deliveryOrderRepository = AppDataSource.getRepository(DeliveryOrder);
    const deliveryOrderItemRepository = AppDataSource.getRepository(DeliveryOrderItem);

    const pendingOrders = await deliveryOrderRepository.find({
      where: {
        customerId: customerId,
        status: DeliveryOrderStatus.PENDING
      },
      relations: ['items']
    });

    for (const order of pendingOrders) {
      let orderUpdated = false;
      let newTotal = 0;

      for (const item of order.items) {
        if (item.productId === productId) {
          item.unitPrice = normalizedPrice;
          item.amount = roundLineAmount(item.quantity, normalizedPrice);
          await deliveryOrderItemRepository.save(item);
          orderUpdated = true;
        }
        newTotal += Number(item.amount);
      }

      if (orderUpdated) {
        // Recalculate total amount from DB to be safe, or use the running total if we iterate all items
        // Since we iterate all items above (even those not matching product), newTotal should be correct
        // But let's double check logic: order.items contains ALL items.
        // The loop updates the matching item, and adds all items' amounts to newTotal.
        // Yes, newTotal is correct.
        order.totalAmount = roundCurrencyAmount(newTotal);
        await deliveryOrderRepository.save(order);
      }
    }

    res.json({ message: '价格设置成功', price: priceRecord });
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

export const deleteProductPrice = async (req: AuthRequest, res: Response) => {
  try {
    const { productId, priceId } = req.params;

    const priceRecord = await productPriceRepository.findOne({
      where: { id: priceId, productId },
    });

    if (!priceRecord) {
      return res.status(404).json({ message: '客户定价不存在' });
    }

    await productPriceRepository.delete(priceId);
    res.json({ message: '客户定价已删除' });
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};
