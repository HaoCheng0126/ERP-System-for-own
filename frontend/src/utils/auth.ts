import { UserRole } from '../types';

// 检查用户是否已认证
export const isAuthenticated = (): boolean => {
  const token = localStorage.getItem('token');
  return !!token;
};

// 获取当前用户角色
export const getUserRole = (): UserRole | null => {
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  try {
    const user = JSON.parse(userStr);
    return user.role;
  } catch {
    return null;
  }
};
