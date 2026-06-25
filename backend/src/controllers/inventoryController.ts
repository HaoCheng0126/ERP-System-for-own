import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { inventoryService } from '../services/inventoryService';
import { UserRole } from '../entities';
import { AppError } from '../utils/AppError';

export const getInventoryRecords = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: '未认证' });
    const records = await inventoryService.getInventoryRecords(req.user.id, req.user.role);
    res.json(records);
  } catch (error: any) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
    res.status(500).json({ message: '服务器错误' });
  }
};

export const getInventoryRecordById = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: '未认证' });
    const record = await inventoryService.getInventoryRecordById(req.params.id, req.user.id, req.user.role);
    res.json(record);
  } catch (error: any) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
    res.status(500).json({ message: '服务器错误' });
  }
};

export const createInventoryRecord = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: '未认证' });
    const body: any = req.body ?? {};
    const records = Array.isArray(body) ? body : Array.isArray(body.records) ? body.records : [];
    const record = await inventoryService.createInventoryRecord(req.user.id, req.user.role, {
      records,
      submittedBy: body.submittedBy,
      submissionMode: body.submissionMode,
    });
    res.status(201).json({
      message: req.user.role === UserRole.ADMIN ? '入库单已创建并生效' : '入库单提交成功',
      record,
    });
  } catch (error: any) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
    res.status(500).json({ message: '服务器错误' });
  }
};

export const reviewInventoryRecord = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: '未认证' });
    const record = await inventoryService.reviewInventoryRecord(req.params.id, req.user.id, {
      status: req.body.status,
      quantity: req.body.quantity,
      remark: req.body.remark,
      rejectionReason: req.body.rejectionReason,
    });
    res.json({ message: '审核完成', record });
  } catch (error: any) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
    res.status(500).json({ message: '服务器错误' });
  }
};

export const reviewInventoryRecordsBatch = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: '未认证' });
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const records = await inventoryService.reviewInventoryRecordsBatch(ids, req.user.id, {
      status: req.body?.status,
      remark: req.body?.remark,
      rejectionReason: req.body?.rejectionReason,
    });
    res.json({ message: `已批量处理 ${records.length} 条入库单`, records });
  } catch (error: any) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
    res.status(500).json({ message: '批量审核失败' });
  }
};

export const updateInventoryRecord = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: '未认证' });
    const record = await inventoryService.updateInventoryRecord(req.params.id, req.user.id, req.user.role, req.body);
    res.json({
      message: req.user.role === UserRole.ADMIN ? '入库单已更新' : '入库单已重新提交',
      record,
    });
  } catch (error: any) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
    res.status(500).json({ message: '服务器错误' });
  }
};

export const deleteInventoryRecord = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: '未认证' });
    await inventoryService.deleteInventoryRecord(req.params.id, req.user.id, req.user.role);
    res.json({ message: '入库单已删除' });
  } catch (error: any) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
    res.status(500).json({ message: '服务器错误' });
  }
};
