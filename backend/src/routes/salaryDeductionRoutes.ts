import express from 'express';
import { listDeductions, createDeduction, deleteDeduction } from '../controllers/salaryDeductionController';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = express.Router();

router.get('/', authenticate, requireAdmin, listDeductions);
router.post('/', authenticate, requireAdmin, createDeduction);
router.delete('/:id', authenticate, requireAdmin, deleteDeduction);

export default router;
