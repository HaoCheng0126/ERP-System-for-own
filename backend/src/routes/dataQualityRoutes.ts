import { Router } from 'express';
import { getDataQualityAudit } from '../controllers/dataQualityController';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();

router.get('/audit', authenticate, requireAdmin, getDataQualityAudit);

export default router;
