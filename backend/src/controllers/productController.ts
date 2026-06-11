import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Product, ProductPrice, Customer, DeliveryOrder, DeliveryOrderStatus, DeliveryOrderItem, InventoryRecord, UserRole } from '../entities';
import { AuthRequest } from '../middlewares/auth';
import { roundCurrencyAmount, roundLineAmount, roundUnitPrice } from '../utils/decimal';

const productRepository = AppDataSource.getRepository(Product);
const productPriceRepository = AppDataSource.getRepository(ProductPrice);
const customerRepository = AppDataSource.getRepository(Customer);
const inventoryRecordRepository = AppDataSource.getRepository(InventoryRecord);
const deliveryOrderItemRepository = AppDataSource.getRepository(DeliveryOrderItem);

export const getProducts = async (req: AuthRequest, res: Response) => {
  try {
    const products = await productRepository.find({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    });

    if (req.user?.role === UserRole.PIECE_RATE) {
      return res.json(products.map((product) => ({
        id: product.id,
        name: product.name,
        specification: product.specification,
        unit: product.unit,
        isActive: product.isActive,
      })));
    }

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error });
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
    res.status(500).json({ message: '服务器错误', error });
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
    res.status(500).json({ message: '服务器错误', error });
  }
};

export const createProduct = async (req: AuthRequest, res: Response) => {
  try {
    if (req.body.stock === undefined || Number(req.body.stock) < 0) {
      return res.status(400).json({ message: '初始库存必须大于等于0' });
    }
    const product = productRepository.create({
      ...req.body,
      costPrice: roundUnitPrice(req.body.costPrice),
      basePrice: req.body.basePrice === undefined || req.body.basePrice === null ? null : roundUnitPrice(req.body.basePrice),
    });
    await productRepository.save(product);
    res.status(201).json({ message: '产品创建成功', product });
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error });
  }
};

export const updateProduct = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const product = await productRepository.findOne({ where: { id } });
    
    if (!product) {
      return res.status(404).json({ message: '产品不存在' });
    }

    if (req.body.stock !== undefined && Number(req.body.stock) < 0) {
      return res.status(400).json({ message: '库存不能小于0' });
    }

    productRepository.merge(product, req.body);
    if (req.body.costPrice !== undefined) {
      product.costPrice = roundUnitPrice(req.body.costPrice);
    }
    if (req.body.basePrice !== undefined) {
      product.basePrice = req.body.basePrice === null ? null : roundUnitPrice(req.body.basePrice);
    }
    await productRepository.save(product);
    res.json({ message: '产品更新成功', product });
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error });
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

    product.isActive = false;
    await productRepository.save(product);
    res.json({ message: '产品已删除' });
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error });
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
    res.status(500).json({ message: '服务器错误', error });
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
    res.status(500).json({ message: '服务器错误', error });
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
    res.status(500).json({ message: '服务器错误', error });
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
    res.status(500).json({ message: '服务器错误', error });
  }
};
