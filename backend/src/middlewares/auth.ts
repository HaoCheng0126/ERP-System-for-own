import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: UserRole;
  };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: '未提供认证令牌' });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: decoded.id } });
    if (!user) {
      return res.status(401).json({ message: '用户不存在，请重新登录' });
    }
    if (!user.isActive) {
      return res.status(403).json({ message: '账户已被禁用' });
    }
    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
    };
    next();
  } catch (error) {
    return res.status(401).json({ message: '无效的认证令牌' });
  }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ message: '需要管理员权限' });
  }
  next();
};
