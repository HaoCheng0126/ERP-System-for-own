import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { InventoryRecord, InventoryRecordStatus, InventoryRecordSubmissionMode, Customer, Product, ProductType, SalaryDeduction } from '../entities';
import { AuthRequest } from '../middlewares/auth';
import { Between } from '../lib/typeorm';
import { accountingService } from '../services/accountingService';

// 产量/产值/近期记录统计排除「退货扣款」负数记录与「直接入库」（不计工资、非员工生产）
const isProductionRecord = (record: InventoryRecord) =>
  record.submissionMode !== InventoryRecordSubmissionMode.RETURN_DEDUCTION &&
  record.submissionMode !== InventoryRecordSubmissionMode.ADMIN_DIRECT;

const inventoryRepository = AppDataSource.getRepository(InventoryRecord);
const deductionRepository = AppDataSource.getRepository(SalaryDeduction);
const customerRepository = AppDataSource.getRepository(Customer);
const productRepository = AppDataSource.getRepository(Product);

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getInventoryStats = async (req: AuthRequest, res: Response) => {
  try {
    const { timeRange = 'today' } = req.query;
    const now = new Date();
    
    // Date ranges
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    
    const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
    const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);

    let startOfRange = startOfDay;
    let endOfRange = endOfDay;

    if (timeRange === 'week') {
      const dayOfWeek = now.getDay() || 7; // 1 (Mon) - 7 (Sun)
      startOfRange = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1, 0, 0, 0, 0);
    } else if (timeRange === 'month') {
      startOfRange = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    } else if (timeRange === 'year') {
      startOfRange = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    }

    // 1. Pending Audits
    const pendingReviewCount = await inventoryRepository.count({
      where: { status: InventoryRecordStatus.PENDING }
    });

    // 2. Total Production Value (in range)
    const productionRecords = await inventoryRepository.find({
      where: {
        createdAt: Between(startOfRange, endOfRange),
        status: InventoryRecordStatus.APPROVED,
      }
    });
    const totalProductionValue = productionRecords.filter(isProductionRecord).reduce((sum, r) => sum + Number(r.totalAmount), 0);

    // 3. Product Growth (Today vs Yesterday)
    const products = await productRepository.find({ where: { isActive: true, type: ProductType.FINISHED } });
    
    const todayRecords = await inventoryRepository.find({
      where: {
        createdAt: Between(startOfDay, endOfDay),
        status: InventoryRecordStatus.APPROVED,
      },
      relations: ['product']
    });

    const yesterdayRecords = await inventoryRepository.find({
      where: {
        createdAt: Between(startOfYesterday, endOfYesterday),
        status: InventoryRecordStatus.APPROVED,
      },
      relations: ['product']
    });

    const productGrowth = products.map(product => {
      const todayQty = todayRecords
        .filter(r => r.productId === product.id && isProductionRecord(r))
        .reduce((sum, r) => sum + r.quantity, 0);
        
      const yesterdayQty = yesterdayRecords
        .filter(r => r.productId === product.id && isProductionRecord(r))
        .reduce((sum, r) => sum + r.quantity, 0);

      let growthRate = 0;
      if (yesterdayQty > 0) {
        growthRate = ((todayQty - yesterdayQty) / yesterdayQty) * 100;
      } else if (todayQty > 0) {
        growthRate = 100;
      }

      return {
        id: product.id,
        name: product.name,
        todayQty,
        yesterdayQty,
        growthRate
      };
    });

    res.json({
      pendingReviewCount,
      totalProductionValue,
      productGrowth
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
};

export const getSalesStats = async (req: AuthRequest, res: Response) => {
  try {
    const { timeRange = 'month' } = req.query;
    const now = new Date();
    
    let startOfRange: Date;
    let endOfRange: Date;

    if (timeRange === 'today') {
      startOfRange = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      endOfRange = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (timeRange === 'year') {
      startOfRange = new Date(now.getFullYear(), 0, 1);
      endOfRange = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    } else {
      // Default month
      startOfRange = new Date(now.getFullYear(), now.getMonth(), 1);
      endOfRange = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    const stats = await accountingService.getFinancialStats(toDateKey(startOfRange), toDateKey(endOfRange));

    res.json({
      ...stats,
      totalSales: stats.salesAmount,
      settledAmount: stats.receivedAmount,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
};

export const getCustomerStats = async (req: AuthRequest, res: Response) => {
  try {
    const stats = await accountingService.getCounterpartyStats();
    res.json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
};

// 近 N 个月「销售 vs 进货」按月聚合，用于仪表盘经营趋势折线图。
export const getBusinessTrends = async (req: AuthRequest, res: Response) => {
  try {
    const months = Math.min(Math.max(Number(req.query.months) || 6, 1), 12);
    const now = new Date();
    const trends: { month: string; label: string; sales: number; purchase: number }[] = [];

    for (let offset = months - 1; offset >= 0; offset -= 1) {
      const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0, 23, 59, 59, 999);
      const stats = await accountingService.getFinancialStats(toDateKey(start), toDateKey(end));
      trends.push({
        month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
        label: `${start.getMonth() + 1}月`,
        sales: stats.salesAmount,
        purchase: stats.purchaseAmount,
      });
    }

    res.json({ trends });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
};

export const getAdminStats = async (req: AuthRequest, res: Response) => {
  try {
    const today = new Date();
    
    // Time boundaries
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    
    const startOfYesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 0, 0, 0, 0);
    const endOfYesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 23, 59, 59, 999);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
    
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);

    // 1. Today's Inventory Count (Created today)
    const todayRecords = await inventoryRepository.find({
      where: {
        createdAt: Between(startOfDay, endOfDay),
        status: InventoryRecordStatus.APPROVED,
      }
    });
    const todayInventoryCount = todayRecords.filter(isProductionRecord).reduce((sum, r) => sum + r.quantity, 0);

    const yesterdayRecords = await inventoryRepository.find({
      where: {
        createdAt: Between(startOfYesterday, endOfYesterday),
        status: InventoryRecordStatus.APPROVED,
      }
    });
    const yesterdayInventoryCount = yesterdayRecords.filter(isProductionRecord).reduce((sum, r) => sum + r.quantity, 0);

    let todayGrowthRate = 0;
    if (yesterdayInventoryCount > 0) {
      todayGrowthRate = ((todayInventoryCount - yesterdayInventoryCount) / yesterdayInventoryCount) * 100;
    } else if (todayInventoryCount > 0) {
      todayGrowthRate = 100;
    }

    // 2. Pending Reviews (Total pending)
    const pendingReviewCount = await inventoryRepository.count({
      where: { status: InventoryRecordStatus.PENDING }
    });

    // 3. Current Month Output Value (Delivery Orders Total Amount)
    const currentMonthStats = await accountingService.getFinancialStats(toDateKey(startOfMonth), toDateKey(endOfMonth));
    const currentMonthOutputValue = currentMonthStats.salesAmount;

    const lastMonthStats = await accountingService.getFinancialStats(toDateKey(startOfLastMonth), toDateKey(endOfLastMonth));
    const lastMonthOutputValue = lastMonthStats.salesAmount;

    let monthGrowthRate = 0;
    if (lastMonthOutputValue > 0) {
      monthGrowthRate = ((currentMonthOutputValue - lastMonthOutputValue) / lastMonthOutputValue) * 100;
    } else if (currentMonthOutputValue > 0) {
      monthGrowthRate = 100;
    }

    // 4. Active Customers (Total customers for now)
    const activeCustomerCount = await customerRepository.count({ where: { isActive: true } });

    // 5. Recent Records (Last 5)
    const recentRecords = await inventoryRepository.find({
      where: { status: InventoryRecordStatus.APPROVED },
      order: { createdAt: 'DESC' },
      take: 5,
      relations: ['submitter', 'product']
    });

    res.json({
      todayInventoryCount,
      todayGrowthRate,
      pendingReviewCount,
      currentMonthOutputValue,
      monthGrowthRate,
      activeCustomerCount,
      recentRecords: recentRecords.filter(isProductionRecord).map(r => ({
        id: r.id,
        recordNumber: r.recordNumber,
        submitterName: r.submitter.name,
        productName: r.product.name,
        quantity: r.quantity,
        status: r.status,
        createdAt: r.createdAt
      }))
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
};

export const getEmployeeStats = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const today = new Date();
    
    // Month boundaries
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
    
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);

    // Current Month Wage (Approved)
    const currentMonthRecords = await inventoryRepository.find({
        where: {
            submitter: { id: userId },
            status: InventoryRecordStatus.APPROVED,
            createdAt: Between(startOfMonth, endOfMonth)
        }
    });
    // 工资口径与工资报表一致：排除「直接入库(不计工资)」与退货扣款记录
    const currentMonthProduction = currentMonthRecords.filter(isProductionRecord);
    const currentMonthWage = currentMonthProduction.reduce((sum, record) => sum + Number(record.totalAmount), 0);
    const approvedMonthCount = currentMonthProduction.length;

    // Last Month Wage (Approved)
    const lastMonthRecords = await inventoryRepository.find({
        where: {
            submitter: { id: userId },
            status: InventoryRecordStatus.APPROVED,
            createdAt: Between(startOfLastMonth, endOfLastMonth)
        }
    });
    const lastMonthWage = lastMonthRecords.filter(isProductionRecord).reduce((sum, record) => sum + Number(record.totalAmount), 0);

    // Counts
    const pendingCount = await inventoryRepository.count({
      where: { 
        submitter: { id: userId },
        status: InventoryRecordStatus.PENDING 
      }
    });

    const rejectedCount = await inventoryRepository.count({
      where: { 
        submitter: { id: userId },
        status: InventoryRecordStatus.REJECTED 
      }
    });

    // Calculate percentage change
    let wageChangePercentage = 0;
    if (lastMonthWage > 0) {
      wageChangePercentage = ((currentMonthWage - lastMonthWage) / lastMonthWage) * 100;
    } else if (currentMonthWage > 0) {
      wageChangePercentage = 100;
    }

    // ===== 所选周期（今日 / 本月 / 本年 / 指定 YYYY-MM）=====
    const round = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
    const period = (req.query.period as string) || 'month';
    const monthParam = req.query.month as string | undefined;
    let periodStart: Date;
    let periodEnd: Date;
    let periodLabel: string;
    if (monthParam) {
      const [py, pm] = monthParam.split('-').map(Number);
      periodStart = new Date(py, pm - 1, 1);
      periodEnd = new Date(py, pm, 0, 23, 59, 59, 999);
      periodLabel = `${py}年${pm}月`;
    } else if (period === 'today') {
      periodStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      periodEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
      periodLabel = '今日';
    } else if (period === 'year') {
      periodStart = new Date(today.getFullYear(), 0, 1);
      periodEnd = new Date(today.getFullYear(), 11, 31, 23, 59, 59, 999);
      periodLabel = '本年';
    } else {
      periodStart = startOfMonth;
      periodEnd = endOfMonth;
      periodLabel = '本月';
    }

    const periodApprovedAll = await inventoryRepository.find({
      where: { submitter: { id: userId }, status: InventoryRecordStatus.APPROVED, createdAt: Between(periodStart, periodEnd) },
      relations: ['product'],
    });
    // 排除直接入库/退货扣款，使产值、产品明细、净工资口径与工资报表一致
    const periodApproved = periodApprovedAll.filter(isProductionRecord);
    const periodApprovedWage = round(periodApproved.reduce((s, r) => s + Number(r.totalAmount), 0));

    const breakdownMap = new Map<string, { productName: string; specification: string; quantity: number; wage: number }>();
    for (const r of periodApproved) {
      const ex = breakdownMap.get(r.productId) || {
        productName: r.product?.name || '未知产品',
        specification: r.product?.specification || '',
        quantity: 0,
        wage: 0,
      };
      ex.quantity = round(ex.quantity + Number(r.quantity));
      ex.wage = round(ex.wage + Number(r.totalAmount));
      breakdownMap.set(r.productId, ex);
    }
    const productBreakdown = Array.from(breakdownMap.values()).sort((a, b) => b.wage - a.wage);

    const periodPending = await inventoryRepository.find({
      where: { submitter: { id: userId }, status: InventoryRecordStatus.PENDING, createdAt: Between(periodStart, periodEnd) },
    });
    const periodPendingWage = round(periodPending.reduce((s, r) => s + Number(r.totalAmount), 0));
    const periodRejectedCount = await inventoryRepository.count({
      where: { submitter: { id: userId }, status: InventoryRecordStatus.REJECTED, createdAt: Between(periodStart, periodEnd) },
    });
    const periodSubmittedCount = await inventoryRepository.count({
      where: { submitter: { id: userId }, createdAt: Between(periodStart, periodEnd) },
    });

    // 所选周期扣款合计
    const pad = (n: number) => String(n).padStart(2, '0');
    const periodStartDate = `${periodStart.getFullYear()}-${pad(periodStart.getMonth() + 1)}-${pad(periodStart.getDate())}`;
    const periodEndDate = `${periodEnd.getFullYear()}-${pad(periodEnd.getMonth() + 1)}-${pad(periodEnd.getDate())}`;
    const periodDeductionRecords = await deductionRepository
      .createQueryBuilder('d')
      .where('d.employeeId = :uid', { uid: userId })
      .andWhere('d.deductionDate >= :ds AND d.deductionDate <= :de', { ds: periodStartDate, de: periodEndDate })
      .getMany();
    const periodDeductions = round(periodDeductionRecords.reduce((s, d) => s + Number(d.amount), 0));

    // 最近 6 个月「已结工价」走势
    const trend: { month: string; wage: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const ms = new Date(m.getFullYear(), m.getMonth(), 1);
      const me = new Date(m.getFullYear(), m.getMonth() + 1, 0, 23, 59, 59, 999);
      const recs = await inventoryRepository.find({
        where: { submitter: { id: userId }, status: InventoryRecordStatus.APPROVED, createdAt: Between(ms, me) },
      });
      trend.push({
        month: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`,
        wage: round(recs.filter(isProductionRecord).reduce((s, r) => s + Number(r.totalAmount), 0)),
      });
    }

    res.json({
      pendingCount,
      rejectedCount,
      approvedMonthCount,
      currentMonthWage: round(currentMonthWage),
      lastMonthWage: round(lastMonthWage),
      wageChangePercentage,
      period: monthParam || period,
      periodLabel,
      periodApprovedWage,
      periodPendingWage,
      periodCounts: {
        submitted: periodSubmittedCount,
        approved: periodApproved.length,
        rejected: periodRejectedCount,
        pending: periodPending.length,
      },
      productBreakdown,
      trend,
      periodDeductions,
      periodNetSalary: round(periodApprovedWage - periodDeductions),
    });

  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};
