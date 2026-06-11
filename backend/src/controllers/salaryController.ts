import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { InventoryRecord, InventoryRecordStatus, User, UserRole } from '../entities';
import { AuthRequest } from '../middlewares/auth';
import { Between } from '../lib/typeorm';

const inventoryRepository = AppDataSource.getRepository(InventoryRecord);
const userRepository = AppDataSource.getRepository(User);

export const getSalaryReport = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, userId, month } = req.query;

    let queryBuilder = inventoryRepository
      .createQueryBuilder('record')
      .leftJoinAndSelect('record.product', 'product')
      .leftJoinAndSelect('record.submitter', 'submitter')
      .where('record.status = :status', { status: InventoryRecordStatus.APPROVED });

    if (month) {
      // 如果提供了月份参数 (格式: YYYY-MM)
      const date = new Date(month as string);
      const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
      
      queryBuilder.andWhere('record.createdAt BETWEEN :startOfMonth AND :endOfMonth', {
        startOfMonth,
        endOfMonth,
      });
    } else if (startDate && endDate) {
      // 兼容原有的日期范围查询
      queryBuilder.andWhere('record.createdAt BETWEEN :startDate AND :endDate', {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
      });
    }

    if (req.user?.role === UserRole.PIECE_RATE) {
      queryBuilder.andWhere('record.submittedBy = :userId', { userId: req.user.id });
    } else if (userId) {
      queryBuilder.andWhere('record.submittedBy = :userId', { userId });
    }

    const records = await queryBuilder.orderBy('record.createdAt', 'DESC').getMany();

    const userTotals = new Map<string, { user: any; totalAmount: number; totalQuantity: number; records: any[] }>();

    records.forEach((record) => {
      const userId = record.submittedBy;
      if (!userTotals.has(userId)) {
        userTotals.set(userId, {
          user: record.submitter,
          totalAmount: 0,
          totalQuantity: 0,
          records: [],
        });
      }
      const userTotal = userTotals.get(userId)!;
      userTotal.totalAmount += Number(record.totalAmount);
      userTotal.totalQuantity += record.quantity;
      userTotal.records.push(record);
    });

    const report = Array.from(userTotals.values());

    res.json({
      report,
      summary: {
        totalRecords: records.length,
        totalAmount: records.reduce((sum, r) => sum + Number(r.totalAmount), 0),
        totalQuantity: records.reduce((sum, r) => sum + r.quantity, 0),
      },
    });
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error });
  }
};
