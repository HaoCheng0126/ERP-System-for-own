import { Router } from 'express';
import { getPayments, createPayment, deletePayment, getCustomerBalance } from '../controllers/paymentController';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

router.get('/', getPayments);
router.post('/', createPayment);
router.delete('/:id', deletePayment);
router.get('/balance/:customerId', getCustomerBalance);

export default router;
