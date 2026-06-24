import type { Repository } from 'typeorm/repository/Repository';
import { AppDataSource } from '../config/database';
import {
  Customer,
  CustomerType,
  PaymentMethod,
  PaymentRecord,
  Product,
  ProductType,
  PurchaseOrder,
  PurchaseOrderStatus,
} from '../entities';
import type { EntityManager } from '../lib/typeorm';
import { AppError } from '../utils/AppError';
import { roundLineAmount, roundQuantity, roundUnitPrice } from '../utils/decimal';
import { createProductWithManager } from '../controllers/productController';

type NewRawMaterialDraft = {
  name?: string;
  specification?: string;
  unit?: string;
  costPrice?: number;
};

type PurchasePayload = Partial<PurchaseOrder>;

const normalizeString = (value: unknown) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};

export class PurchaseService {
  private purchaseRepository = AppDataSource.getRepository(PurchaseOrder);
  private customerRepository = AppDataSource.getRepository(Customer);
  private paymentRepository = AppDataSource.getRepository(PaymentRecord);
  private productRepository = AppDataSource.getRepository(Product);

  private async findSupplier(supplierId: string) {
    const supplier = await this.customerRepository.findOne({
      where: {
        id: supplierId,
        type: CustomerType.SUPPLIER,
      },
    });

    if (!supplier) {
      throw new AppError('供应商不存在', 400);
    }

    return supplier;
  }

  private normalizePurchaseNumbers(quantity: unknown, unitPrice: unknown) {
    const normalizedQuantity = roundQuantity(quantity as number | string | null | undefined);
    const normalizedUnitPrice = roundUnitPrice(unitPrice as number | string | null | undefined);

    if (normalizedQuantity <= 0) {
      throw new AppError('请输入正确的数量', 400);
    }

    if (normalizedUnitPrice < 0) {
      throw new AppError('请输入正确的单价', 400);
    }

    return {
      quantity: normalizedQuantity,
      unitPrice: normalizedUnitPrice,
      amount: roundLineAmount(normalizedQuantity, normalizedUnitPrice, 4),
    };
  }

  private async findRawMaterial(productId: string, manager?: EntityManager) {
    const repository = manager ? manager.getRepository(Product) : this.productRepository;
    const product = await repository.findOne({
      where: { id: productId, isActive: true, type: ProductType.RAW_MATERIAL },
    });

    if (!product) {
      throw new AppError('原材料不存在或已停用', 400);
    }

    return product;
  }

  private async adjustRawMaterialStock(
    manager: EntityManager,
    productId: string,
    deltaQuantity: number,
    errorMessage = '原材料库存不足，无法完成当前操作',
  ) {
    const product = await this.findRawMaterial(productId, manager);
    const nextStock = roundQuantity((Number(product.stock) || 0) + Number(deltaQuantity));
    if (nextStock < 0) {
      throw new AppError(errorMessage, 400);
    }

    product.stock = nextStock;
    await manager.save(product);
  }

  private async migrateLegacyPaidAmountIfNeeded(
    purchase: PurchaseOrder,
    supplier: Customer,
    remarkFromRequest: string,
    paymentRepository: Repository<PaymentRecord>,
  ) {
    const legacyPaidAmount = Number(purchase.paidAmount || 0);
    if (legacyPaidAmount <= 0) {
      return;
    }

    const historicalPayment = paymentRepository.create({
      customerId: supplier.id,
      amount: legacyPaidAmount,
      paymentDate: purchase.purchaseDate,
      method: PaymentMethod.PUBLIC_CASH,
      remarks: `历史迁移：原进货记录已付金额${remarkFromRequest ? `；${remarkFromRequest}` : ''}`,
    });

    await paymentRepository.save(historicalPayment);

    purchase.paidAmount = 0;
    purchase.status = PurchaseOrderStatus.PENDING;
  }

  async create(data: PurchasePayload) {
    const purchaseDate = normalizeString(data.purchaseDate);
    const supplierId = normalizeString(data.supplierId);
    const productId = normalizeString((data as any).productId);
    const newProduct = (data as any).newProduct as NewRawMaterialDraft | undefined;
    const remark = normalizeString(data.remark);

    if (!purchaseDate || !supplierId || (!productId && !newProduct)) {
      throw new AppError('缺少必填字段', 400);
    }

    return AppDataSource.transaction(async (manager) => {
      const supplier = await this.findSupplier(supplierId);
      const product = productId
        ? await this.findRawMaterial(productId, manager)
        : await createProductWithManager(manager, {
            name: normalizeString(newProduct?.name),
            specification: normalizeString(newProduct?.specification),
            unit: normalizeString(newProduct?.unit),
            costPrice: Number(newProduct?.costPrice) || 0,
            type: ProductType.RAW_MATERIAL,
          });
      const normalizedNumbers = this.normalizePurchaseNumbers(data.quantity, data.unitPrice);
      const item = normalizeString(data.item) || `${product.name}${product.specification ? ` ${product.specification}` : ''}`;
      const unit = normalizeString(data.unit) || product.unit || '个';

      const purchase = manager.create(PurchaseOrder, {
        purchaseDate,
        supplierId: supplier.id,
        supplier: supplier.name,
        productId: product.id,
        item,
        unit,
        quantity: normalizedNumbers.quantity,
        unitPrice: normalizedNumbers.unitPrice,
        amount: normalizedNumbers.amount,
        paidAmount: 0,
        status: PurchaseOrderStatus.PENDING,
        stockApplied: true,
        remark: remark || null,
      });

      await manager.save(purchase);
      await this.adjustRawMaterialStock(manager, product.id, Number(normalizedNumbers.quantity));

      return manager.findOne(PurchaseOrder, {
        where: { id: purchase.id },
        relations: ['supplierEntity', 'product'],
      });
    });
  }

  async findAll() {
    return this.purchaseRepository.find({
      relations: ['supplierEntity', 'product'],
      order: { purchaseDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const purchase = await this.purchaseRepository.findOne({
      where: { id },
      relations: ['supplierEntity', 'product'],
    });

    if (!purchase) {
      throw new AppError('采购记录不存在', 404);
    }

    return purchase;
  }

  async update(id: string, data: PurchasePayload) {
    const purchase = await this.findOne(id);
    const purchaseDate = normalizeString(data.purchaseDate) || purchase.purchaseDate;
    const nextSupplierId = normalizeString(data.supplierId) || purchase.supplierId || '';
    const nextProductId = normalizeString((data as any).productId);
    const newProduct = (data as any).newProduct as NewRawMaterialDraft | undefined;
    const remark = data.remark !== undefined ? normalizeString(data.remark) : purchase.remark;

    if (!purchaseDate || !nextSupplierId) {
      throw new AppError('缺少必填字段', 400);
    }

    const supplier = await this.findSupplier(nextSupplierId);
    const normalizedNumbers = this.normalizePurchaseNumbers(
      data.quantity !== undefined ? data.quantity : purchase.quantity,
      data.unitPrice !== undefined ? data.unitPrice : purchase.unitPrice,
    );

    return AppDataSource.transaction(async (manager) => {
      const transactionPurchaseRepository = manager.getRepository(PurchaseOrder);
      const transactionPaymentRepository = manager.getRepository(PaymentRecord);

      if (purchase.stockApplied && purchase.productId) {
        await this.adjustRawMaterialStock(
          manager,
          purchase.productId,
          -Number(purchase.quantity),
          '原材料库存不足，无法修改该进货记录',
        );
      }

      const nextProduct = newProduct
        ? await createProductWithManager(manager, {
            name: normalizeString(newProduct?.name),
            specification: normalizeString(newProduct?.specification),
            unit: normalizeString(newProduct?.unit),
            costPrice: Number(newProduct?.costPrice) || 0,
            type: ProductType.RAW_MATERIAL,
          })
        : nextProductId
          ? await this.findRawMaterial(nextProductId, manager)
          : null;

      const item =
        normalizeString(data.item) ||
        (nextProduct
          ? `${nextProduct.name}${nextProduct.specification ? ` ${nextProduct.specification}` : ''}`
          : purchase.item);
      const unit = normalizeString(data.unit) || nextProduct?.unit || purchase.unit || '个';

      if (!item) {
        throw new AppError('缺少必填字段', 400);
      }

      purchase.purchaseDate = purchaseDate;
      purchase.item = item;
      purchase.unit = unit;
      purchase.supplierId = supplier.id;
      purchase.supplier = supplier.name;
      purchase.productId = nextProduct?.id || purchase.productId || null;
      purchase.quantity = normalizedNumbers.quantity;
      purchase.unitPrice = normalizedNumbers.unitPrice;
      purchase.amount = normalizedNumbers.amount;
      purchase.remark = remark || null;

      await this.migrateLegacyPaidAmountIfNeeded(
        purchase,
        supplier,
        remark || '',
        transactionPaymentRepository,
      );

      if (purchase.productId) {
        await this.adjustRawMaterialStock(manager, purchase.productId, Number(purchase.quantity));
        purchase.stockApplied = true;
      }

      await transactionPurchaseRepository.save(purchase);
      return transactionPurchaseRepository.findOne({
        where: { id: purchase.id },
        relations: ['supplierEntity', 'product'],
      });
    });
  }

  async delete(id: string) {
    return AppDataSource.transaction(async (manager) => {
      const purchase = await manager.findOne(PurchaseOrder, { where: { id } });
      if (!purchase) {
        throw new AppError('采购记录不存在', 404);
      }

      if (purchase.stockApplied && purchase.productId) {
        await this.adjustRawMaterialStock(
          manager,
          purchase.productId,
          -Number(purchase.quantity),
          '原材料库存不足，无法删除该进货记录',
        );
      }

      await manager.delete(PurchaseOrder, { id });
      return true;
    });
  }
}

export const purchaseService = new PurchaseService();
