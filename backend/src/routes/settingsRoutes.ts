import { Router } from 'express';
import {
  getVisionSettings,
  updateVisionSettings,
  clearVisionApiKey,
  testVisionSettings,
} from '../controllers/settingsController';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();

router.get('/vision', authenticate, requireAdmin, getVisionSettings);
router.put('/vision', authenticate, requireAdmin, updateVisionSettings);
router.delete('/vision/key', authenticate, requireAdmin, clearVisionApiKey);
router.post('/vision/test', authenticate, requireAdmin, testVisionSettings);

export default router;
