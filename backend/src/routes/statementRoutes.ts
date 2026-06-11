import { Router } from 'express';
import { getStatements, createStatement } from '../controllers/statementController';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();

router.get('/', authenticate, requireAdmin, getStatements);
router.post('/', authenticate, requireAdmin, createStatement);

export default router;
