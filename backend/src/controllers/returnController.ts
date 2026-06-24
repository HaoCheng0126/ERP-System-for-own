import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { returnService } from '../services/returnService';

export const getReturnOrders = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const orders = await returnService.list();
    res.json(orders);
  } catch (error) {
    next(error);
  }
};

export const getReturnOrderById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const order = await returnService.getById(req.params.id);
    res.json(order);
  } catch (error) {
    next(error);
  }
};

export const createReturnOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const order = await returnService.create(req.user!.id, req.body);
    res.status(201).json(order);
  } catch (error) {
    next(error);
  }
};

export const deleteReturnOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await returnService.delete(req.params.id);
    res.json({ message: '退货单已删除' });
  } catch (error) {
    next(error);
  }
};
