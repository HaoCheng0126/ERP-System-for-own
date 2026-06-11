import { Router } from 'express';
import {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '../controllers/customerController';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();

router.get('/', authenticate, requireAdmin, getCustomers);
router.get('/:id', authenticate, requireAdmin, getCustomerById);
router.post('/', authenticate, requireAdmin, createCustomer);
router.put('/:id', authenticate, requireAdmin, updateCustomer);
router.delete('/:id', authenticate, requireAdmin, deleteCustomer);

export default router;
