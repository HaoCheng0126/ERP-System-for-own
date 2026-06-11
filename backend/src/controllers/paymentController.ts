import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { PaymentRecord, Customer, CustomerType, DeliveryOrder, PurchaseOrder } from '../entities';
import { AuthRequest } from '../middlewares/auth';
import { Between } from '../lib/typeorm';

const paymentRepository = AppDataSource.getRepository(PaymentRecord);
const customerRepository = AppDataSource.getRepository(Customer);
const deliveryOrderRepository = AppDataSource.getRepository(DeliveryOrder);
const purchaseOrderRepository = AppDataSource.getRepository(PurchaseOrder);

const normalizeDateValue = (value: string | Date) => {
  if (typeof value === 'string') {
    return value;
  }

  return value.toISOString().split('T')[0];
};

const calculateBusinessAmountAtDate = async (customer: Customer, cutoffDate: string) => {
  if (customer.type === CustomerType.SUPPLIER) {
    const purchases = await purchaseOrderRepository.find({ where: { supplierId: customer.id } });
    return purchases.reduce((sum, purchase) => {
      if (purchase.purchaseDate <= cutoffDate) {
        return sum + Number(purchase.amount);
      }
      return sum;
    }, 0);
  }

  const deliveryOrders = await deliveryOrderRepository.find({ where: { customerId: customer.id } });
  return deliveryOrders.reduce((sum, order) => {
    if (order.deliveryDate <= cutoffDate) {
      return sum + Number(order.totalAmount);
    }
    return sum;
  }, 0);
};

const calculateCustomerBalanceAtDate = async (customer: Customer, cutoffDate: string) => {
  const [totalBusiness, payments] = await Promise.all([
    calculateBusinessAmountAtDate(customer, cutoffDate),
    paymentRepository.find({ where: { customerId: customer.id } }),
  ]);

  const totalPayment = payments.reduce((sum, payment) => {
    if (normalizeDateValue(payment.paymentDate) <= cutoffDate) {
      return sum + Number(payment.amount);
    }
    return sum;
  }, 0);

  return totalBusiness - totalPayment;
};

export const getPayments = async (req: AuthRequest, res: Response) => {
  try {
    const { customerId, startDate, endDate } = req.query;
    
    const where: any = {};
    if (customerId) where.customerId = customerId;
    if (startDate && endDate) {
      where.paymentDate = Between(startDate, endDate);
    }

    const payments = await paymentRepository.find({
      where,
      relations: ['customer'],
      order: { paymentDate: 'DESC', createdAt: 'DESC' }
    });
    
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error });
  }
};

export const createPayment = async (req: AuthRequest, res: Response) => {
  try {
    const { customerId, amount, paymentDate, method, remarks } = req.body;
    const normalizedAmount = Number(amount);
    
    const customer = await customerRepository.findOne({ where: { id: customerId } });
    if (!customer) {
      return res.status(404).json({ message: '客户不存在' });
    }

    if (!paymentDate || !method || !Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return res.status(400).json({ message: '请输入正确的付款金额' });
    }

    const balanceAtPaymentDate = await calculateCustomerBalanceAtDate(customer, paymentDate);
    if (normalizedAmount - balanceAtPaymentDate > 0.0001) {
      return res.status(400).json({
        message: '输入错误，请重新核对金额',
        availableBalance: balanceAtPaymentDate,
      });
    }

    const payment = paymentRepository.create({
      customerId,
      amount: normalizedAmount,
      paymentDate,
      method,
      remarks
    });

    await paymentRepository.save(payment);
    res.status(201).json({ message: '付款记录创建成功', payment });
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error });
  }
};

export const deletePayment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const payment = await paymentRepository.findOne({ where: { id } });
    
    if (!payment) {
      return res.status(404).json({ message: '付款记录不存在' });
    }

    await paymentRepository.delete(id);
    res.json({ message: '付款记录已删除' });
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error });
  }
};

export const getCustomerBalance = async (req: AuthRequest, res: Response) => {
  try {
    const { customerId } = req.params;
    const customer = await customerRepository.findOne({ where: { id: customerId } });
    
    if (!customer) {
      return res.status(404).json({ message: '客户不存在' });
    }

    const [totalBusiness, payments] = await Promise.all([
      calculateBusinessAmountAtDate(customer, '2099-12-31'),
      paymentRepository.find({ where: { customerId } }),
    ]);
    const totalPayment = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const balance = totalBusiness - totalPayment;

    res.json({
      customerId,
      customerName: customer.name,
      customerType: customer.type,
      totalBusiness,
      totalDelivery: customer.type === CustomerType.CLIENT ? totalBusiness : 0,
      totalPurchase: customer.type === CustomerType.SUPPLIER ? totalBusiness : 0,
      totalPayment,
      balance
    });
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error });
  }
};
