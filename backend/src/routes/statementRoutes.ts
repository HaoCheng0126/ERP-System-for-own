import { Router } from 'express';
import { getStatements, createStatement, getReconciliation } from '../controllers/statementController';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();

router.get('/', authenticate, requireAdmin, getStatements);
router.get('/reconciliation', authenticate, requireAdmin, getReconciliation);
router.post('/', authenticate, requireAdmin, createStatement);

export default router;
