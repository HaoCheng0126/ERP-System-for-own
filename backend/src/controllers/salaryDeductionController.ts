import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { salaryDeductionService } from '../services/salaryDeductionService';
import { AppError } from '../utils/AppError';

export const listDeductions = async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId, startDate, endDate, month } = req.query as Record<string, string | undefined>;
    const deductions = await salaryDeductionService.list({ employeeId, startDate, endDate, month });
    res.json(deductions);
  } catch (error: any) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
    res.status(500).json({ message: '服务器错误' });
  }
};

export const createDeduction = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: '未认证' });
    const { employeeId, type, amount, reason, deductionDate } = req.body;
    if (!employeeId || amount === undefined || !deductionDate) {
      return res.status(400).json({ message: '请提供员工、金额和扣款日期' });
    }
    const deduction = await salaryDeductionService.create({
      employeeId,
      type: type || 'other',
      amount: Number(amount),
      reason: reason ?? null,
      deductionDate,
      createdBy: req.user.id,
    });
    res.status(201).json({ message: '扣款记录已创建', deduction });
  } catch (error: any) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
    res.status(500).json({ message: '服务器错误' });
  }
};

export const deleteDeduction = async (req: AuthRequest, res: Response) => {
  try {
    await salaryDeductionService.delete(req.params.id);
    res.json({ message: '扣款记录已删除' });
  } catch (error: any) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
    res.status(500).json({ message: '服务器错误' });
  }
};
