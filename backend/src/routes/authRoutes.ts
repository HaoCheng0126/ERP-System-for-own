import { Router } from 'express';
import {
  register,
  login,
  getCurrentUser,
  changePassword,
  updateProfile,
  getFeishuStatus,
  redirectToFeishuAuthorize,
  loginWithFeishu,
} from '../controllers/authController';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();

router.post('/register', authenticate, requireAdmin, register);
router.post('/login', login);
router.get('/feishu/status', getFeishuStatus);
router.get('/feishu/authorize', redirectToFeishuAuthorize);
router.post('/feishu/login', loginWithFeishu);
router.get('/me', authenticate, getCurrentUser);
router.post('/change-password', authenticate, changePassword);
router.put('/profile', authenticate, updateProfile);

export default router;
