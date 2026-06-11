import { Router } from 'express';
import { authenticate, requireAdmin } from '../middlewares/auth';
import { getAllUsers, createUser, updateUser, deleteUser, resetUserPassword } from '../controllers/userController';

const router = Router();

// 用户管理路由 (仅管理员)
router.get('/', authenticate, requireAdmin, getAllUsers);
router.post('/', authenticate, requireAdmin, createUser);
router.put('/:id', authenticate, requireAdmin, updateUser);
router.delete('/:id', authenticate, requireAdmin, deleteUser);
router.post('/:id/reset-password', authenticate, requireAdmin, resetUserPassword);

export default router;
