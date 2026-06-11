import { Router } from 'express';
import { completeSetup, getSetupStatus } from '../controllers/setupController';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();

router.get('/status', authenticate, requireAdmin, getSetupStatus);
router.post('/complete', authenticate, requireAdmin, completeSetup);

export default router;
