import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { userService } from '../services/userService';
import { AppError } from '../utils/AppError';

// 获取所有用户
export const getAllUsers = async (_req: AuthRequest, res: Response) => {
  try {
    const users = await userService.getAllUsers();
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ message: '获取用户列表失败' });
  }
};

// 创建用户 (管理员功能)
export const createUser = async (req: AuthRequest, res: Response) => {
  try {
    const user = await userService.createUser(req.body);
    res.status(201).json({ 
      message: '用户创建成功', 
      user
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: '创建用户失败' });
  }
};

// 更新用户
export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = await userService.updateUser(id, req.body);
    res.json({ 
      message: '用户更新成功',
      user
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: '更新用户失败' });
  }
};

// 删除用户 (可选)
export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await userService.deleteUser(id, req.user?.id);
    res.json({ message: '用户已删除' });
  } catch (error: any) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: '删除用户失败' });
  }
};

export const resetUserPassword = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body || {};
    await userService.resetPassword(id, newPassword);
    res.json({ message: '密码已重置' });
  } catch (error: any) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: '重置密码失败' });
  }
};
