import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { InventoryRecord, InventoryRecordStatus, User, UserRole } from '../entities';
import { AuthRequest } from '../middlewares/auth';
import { Between } from '../lib/typeorm';
import { roundCurrencyAmount, roundQuantity } from '../utils/decimal';

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
      // 月份参数 (格式: YYYY-MM)。显式拆分按本地时区构造，避免 new Date('YYYY-MM')
      // 被解析成 UTC 0 点、再用本地时区读取，导致 UTC 以西时区整月算错（与下面 startDate/endDate 同款处理）。
      const [monthYear, monthIndex] = (month as string).split('-').map(Number);
      const startOfMonth = new Date(monthYear, monthIndex - 1, 1, 0, 0, 0, 0);
      const endOfMonth = new Date(monthYear, monthIndex, 0, 23, 59, 59, 999);
      
      queryBuilder.andWhere('record.createdAt BETWEEN :startOfMonth AND :endOfMonth', {
        startOfMonth,
        endOfMonth,
      });
    } else if (startDate && endDate) {
      // 兼容原有的日期范围查询：按本地时区把开始日归一到 00:00:00、结束日归一到 23:59:59.999，
      // 否则 new Date('YYYY-MM-DD') 会被当成当天 0 点（UTC），导致结束日当天的记录被整天漏算。
      const [startYear, startMonth, startDay] = (startDate as string).split('-').map(Number);
      const [endYear, endMonth, endDay] = (endDate as string).split('-').map(Number);
      const rangeStart = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
      const rangeEnd = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

      queryBuilder.andWhere('record.createdAt BETWEEN :rangeStart AND :rangeEnd', {
        rangeStart,
        rangeEnd,
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

    // 金额/数量统一四舍五入，避免浮点累加产生 4823.8400000001 之类的漂移，
    // 让每个员工的合计与汇总口径一致（工资即按此发放，无单独结算表）。
    const report = Array.from(userTotals.values()).map((entry) => ({
      ...entry,
      totalAmount: roundCurrencyAmount(entry.totalAmount),
      totalQuantity: roundQuantity(entry.totalQuantity),
    }));

    res.json({
      report,
      summary: {
        totalRecords: records.length,
        totalAmount: roundCurrencyAmount(
          records.reduce((sum, r) => sum + Number(r.totalAmount), 0),
        ),
        totalQuantity: roundQuantity(records.reduce((sum, r) => sum + Number(r.quantity), 0)),
      },
    });
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};
