import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { PaymentRecord } from '../entities';
import { AuthRequest } from '../middlewares/auth';
import { Between } from '../lib/typeorm';
import { accountingService } from '../services/accountingService';

const paymentRepository = AppDataSource.getRepository(PaymentRecord);

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
    res.status(500).json({ message: '服务器错误' });
  }
};

export const createPayment = async (req: AuthRequest, res: Response) => {
  try {
    const { customerId, amount, paymentDate, method, remarks } = req.body;
    const normalizedAmount = Number(amount);

    if (!customerId || !paymentDate || !method || !Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return res.status(400).json({ message: '请输入正确的付款金额' });
    }

    const balanceInfo = await accountingService.getCustomerBalanceAtDate(customerId, paymentDate);
    if (!balanceInfo) {
      return res.status(404).json({ message: '客户不存在' });
    }

    const balanceAtPaymentDate = balanceInfo.balance;
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
    res.status(500).json({ message: '服务器错误' });
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
    res.status(500).json({ message: '服务器错误' });
  }
};

export const getCustomerBalance = async (req: AuthRequest, res: Response) => {
  try {
    const { customerId } = req.params;
    const cutoffDate = typeof req.query.date === 'string' && req.query.date ? req.query.date : '9999-12-31';
    const balanceInfo = await accountingService.getCustomerBalanceAtDate(customerId, cutoffDate);

    if (!balanceInfo) {
      return res.status(404).json({ message: '客户不存在' });
    }

    res.json({
      customerId,
      customerName: balanceInfo.customer.name,
      customerType: balanceInfo.customer.type,
      initialBalance: balanceInfo.initialBalance,
      totalBusiness: balanceInfo.totalBusiness,
      totalDelivery: balanceInfo.customer.type === 'Client' ? balanceInfo.totalBusiness : 0,
      totalPurchase: balanceInfo.customer.type === 'Supplier' ? balanceInfo.totalBusiness : 0,
      totalPayment: balanceInfo.totalPayment,
      balance: balanceInfo.balance
    });
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};
