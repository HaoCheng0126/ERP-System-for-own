import { Request, Response, NextFunction } from 'express';
import { purchaseService } from '../services/purchaseService';
import { AppError } from '../utils/AppError';

export class PurchaseController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const purchase = await purchaseService.create(req.body);
      res.status(201).json(purchase);
    } catch (error) {
      next(error);
    }
  }

  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const purchases = await purchaseService.findAll();
      res.json(purchases);
    } catch (error) {
      next(error);
    }
  }

  async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const purchase = await purchaseService.findOne(req.params.id);
      res.json(purchase);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const purchase = await purchaseService.update(req.params.id, req.body);
      res.json(purchase);
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await purchaseService.delete(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}

export const purchaseController = new PurchaseController();
