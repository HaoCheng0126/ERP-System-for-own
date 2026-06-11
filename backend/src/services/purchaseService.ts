import type { Repository } from 'typeorm/repository/Repository';
import { AppDataSource } from '../config/database';
import { Customer, CustomerType, PaymentMethod, PaymentRecord, PurchaseOrder, PurchaseOrderStatus } from '../entities';
import { AppError } from '../utils/AppError';
import { roundLineAmount, roundQuantity, roundUnitPrice } from '../utils/decimal';

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
    const item = normalizeString(data.item);
    const supplierId = normalizeString(data.supplierId);
    const unit = normalizeString(data.unit) || '个';
    const remark = normalizeString(data.remark);

    if (!purchaseDate || !item || !supplierId) {
      throw new AppError('缺少必填字段', 400);
    }

    const supplier = await this.findSupplier(supplierId);
    const normalizedNumbers = this.normalizePurchaseNumbers(data.quantity, data.unitPrice);

    const purchase = this.purchaseRepository.create({
      purchaseDate,
      supplierId: supplier.id,
      supplier: supplier.name,
      item,
      unit,
      quantity: normalizedNumbers.quantity,
      unitPrice: normalizedNumbers.unitPrice,
      amount: normalizedNumbers.amount,
      paidAmount: 0,
      status: PurchaseOrderStatus.PENDING,
      remark: remark || null,
    });

    return this.purchaseRepository.save(purchase);
  }

  async findAll() {
    return this.purchaseRepository.find({
      relations: ['supplierEntity'],
      order: { purchaseDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const purchase = await this.purchaseRepository.findOne({
      where: { id },
      relations: ['supplierEntity'],
    });

    if (!purchase) {
      throw new AppError('采购记录不存在', 404);
    }

    return purchase;
  }

  async update(id: string, data: PurchasePayload) {
    const purchase = await this.findOne(id);
    const purchaseDate = normalizeString(data.purchaseDate) || purchase.purchaseDate;
    const item = normalizeString(data.item) || purchase.item;
    const unit = normalizeString(data.unit) || purchase.unit || '个';
    const nextSupplierId = normalizeString(data.supplierId) || purchase.supplierId || '';
    const remark = data.remark !== undefined ? normalizeString(data.remark) : purchase.remark;

    if (!purchaseDate || !item || !nextSupplierId) {
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

      purchase.purchaseDate = purchaseDate;
      purchase.item = item;
      purchase.unit = unit;
      purchase.supplierId = supplier.id;
      purchase.supplier = supplier.name;
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

      return transactionPurchaseRepository.save(purchase);
    });
  }

  async delete(id: string) {
    const result = await this.purchaseRepository.delete(id);
    if (result.affected === 0) {
      throw new AppError('采购记录不存在', 404);
    }
    return true;
  }
}

export const purchaseService = new PurchaseService();
