import { Response } from 'express';
import { AppDataSource } from '../config/database';
import {
  InventoryRecord,
  InventoryRecordStatus,
  InventoryRecordSubmissionMode,
  SalaryDeduction,
  UserRole,
} from '../entities';
import { AuthRequest } from '../middlewares/auth';
import { roundCurrencyAmount, roundQuantity } from '../utils/decimal';

const inventoryRepository = AppDataSource.getRepository(InventoryRecord);
const deductionRepository = AppDataSource.getRepository(SalaryDeduction);

export const getSalaryReport = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, userId, month } = req.query;

    // ──────────────────────────────────────────────────────────────────
    // 1. Inventory records (gross earnings)
    //    Exclude ADMIN_DIRECT and legacy RETURN_DEDUCTION (replaced by
    //    the new salary_deductions table going forward).
    // ──────────────────────────────────────────────────────────────────
    const recordQb = inventoryRepository
      .createQueryBuilder('record')
      .leftJoinAndSelect('record.product', 'product')
      .leftJoinAndSelect('record.submitter', 'submitter')
      .where('record.status = :status', { status: InventoryRecordStatus.APPROVED })
      .andWhere('record.submissionMode NOT IN (:...excluded)', {
        excluded: [
          InventoryRecordSubmissionMode.ADMIN_DIRECT,
          InventoryRecordSubmissionMode.RETURN_DEDUCTION,
        ],
      });

    if (month) {
      const [y, m] = (month as string).split('-').map(Number);
      recordQb.andWhere('record.createdAt BETWEEN :s AND :e', {
        s: new Date(y, m - 1, 1, 0, 0, 0, 0),
        e: new Date(y, m, 0, 23, 59, 59, 999),
      });
    } else if (startDate && endDate) {
      const [sy, sm, sd] = (startDate as string).split('-').map(Number);
      const [ey, em, ed] = (endDate as string).split('-').map(Number);
      recordQb.andWhere('record.createdAt BETWEEN :s AND :e', {
        s: new Date(sy, sm - 1, sd, 0, 0, 0, 0),
        e: new Date(ey, em - 1, ed, 23, 59, 59, 999),
      });
    }

    if (req.user?.role === UserRole.PIECE_RATE) {
      recordQb.andWhere('record.submittedBy = :uid', { uid: req.user.id });
    } else if (userId) {
      recordQb.andWhere('record.submittedBy = :uid', { uid: userId });
    }

    const records = await recordQb.orderBy('record.createdAt', 'DESC').getMany();

    // ──────────────────────────────────────────────────────────────────
    // 2. Salary deductions for the same period (filtered by deductionDate)
    // ──────────────────────────────────────────────────────────────────
    const dqb = deductionRepository
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.employee', 'employee');

    if (month) {
      const [y, m] = (month as string).split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      dqb.andWhere('d.deductionDate >= :ds AND d.deductionDate <= :de', {
        ds: `${y}-${String(m).padStart(2, '0')}-01`,
        de: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      });
    } else if (startDate && endDate) {
      dqb.andWhere('d.deductionDate >= :ds AND d.deductionDate <= :de', {
        ds: startDate,
        de: endDate,
      });
    }

    if (req.user?.role === UserRole.PIECE_RATE) {
      dqb.andWhere('d.employeeId = :uid', { uid: req.user.id });
    } else if (userId) {
      dqb.andWhere('d.employeeId = :uid', { uid: userId });
    }

    const deductions = await dqb.orderBy('d.deductionDate', 'DESC').getMany();

    // ──────────────────────────────────────────────────────────────────
    // 3. Build per-employee map
    // ──────────────────────────────────────────────────────────────────
    type EmployeeEntry = {
      user: any;
      grossAmount: number;
      totalDeductions: number;
      totalQuantity: number;
      records: any[];
      deductions: any[];
    };

    const userMap = new Map<string, EmployeeEntry>();

    const getOrCreate = (uid: string, user: any): EmployeeEntry => {
      if (!userMap.has(uid)) {
        userMap.set(uid, {
          user,
          grossAmount: 0,
          totalDeductions: 0,
          totalQuantity: 0,
          records: [],
          deductions: [],
        });
      }
      return userMap.get(uid)!;
    };

    records.forEach((r) => {
      const entry = getOrCreate(r.submittedBy, r.submitter);
      entry.grossAmount += Number(r.totalAmount);
      entry.totalQuantity += Number(r.quantity);
      entry.records.push(r);
    });

    deductions.forEach((d) => {
      const entry = getOrCreate(d.employeeId, d.employee);
      entry.totalDeductions += Number(d.amount);
      entry.deductions.push(d);
    });

    const report = Array.from(userMap.values()).map((entry) => {
      const grossAmount = roundCurrencyAmount(entry.grossAmount);
      const totalDeductions = roundCurrencyAmount(entry.totalDeductions);
      return {
        user: entry.user,
        grossAmount,
        totalDeductions,
        netSalary: roundCurrencyAmount(grossAmount - totalDeductions),
        totalQuantity: roundQuantity(entry.totalQuantity),
        records: entry.records,
        deductions: entry.deductions,
      };
    });

    const totalGrossAmount = roundCurrencyAmount(report.reduce((s, r) => s + r.grossAmount, 0));
    const totalDeductionsSum = roundCurrencyAmount(report.reduce((s, r) => s + r.totalDeductions, 0));

    res.json({
      report,
      summary: {
        totalRecords: records.length,
        totalGrossAmount,
        totalDeductions: totalDeductionsSum,
        totalNetSalary: roundCurrencyAmount(totalGrossAmount - totalDeductionsSum),
        totalQuantity: roundQuantity(records.reduce((s, r) => s + Number(r.quantity), 0)),
      },
    });
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};
