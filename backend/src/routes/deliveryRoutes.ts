import { Router } from 'express';
import {
  getDeliveryOrders,
  getDeliveryOrderById,
  createDeliveryOrder,
  updateDeliveryOrderStatus,
  updateDeliveryOrder,
  deleteDeliveryOrder,
} from '../controllers/deliveryController';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();

router.get('/', authenticate, requireAdmin, getDeliveryOrders);
router.get('/:id', authenticate, requireAdmin, getDeliveryOrderById);
router.post('/', authenticate, requireAdmin, createDeliveryOrder);
router.put('/:id', authenticate, requireAdmin, updateDeliveryOrder);
router.delete('/:id', authenticate, requireAdmin, deleteDeliveryOrder);
router.post('/status', authenticate, requireAdmin, updateDeliveryOrderStatus);

export default router;
