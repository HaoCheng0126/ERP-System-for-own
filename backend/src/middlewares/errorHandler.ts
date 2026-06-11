import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled Error:', err);

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
  }

  // TypeORM errors or other unhandled errors
  return res.status(500).json({
    status: 'error',
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err : undefined,
  });
};
