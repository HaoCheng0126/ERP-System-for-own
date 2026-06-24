import { Router } from 'express';
import {
  getReturnOrders,
  getReturnOrderById,
  createReturnOrder,
  deleteReturnOrder,
} from '../controllers/returnController';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();

router.get('/', authenticate, requireAdmin, getReturnOrders);
router.get('/:id', authenticate, requireAdmin, getReturnOrderById);
router.post('/', authenticate, requireAdmin, createReturnOrder);
router.delete('/:id', authenticate, requireAdmin, deleteReturnOrder);

export default router;
