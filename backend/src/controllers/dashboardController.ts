import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { InventoryRecord, InventoryRecordStatus, Customer, DeliveryOrder, DeliveryOrderStatus, Product } from '../entities';
import { AuthRequest } from '../middlewares/auth';
import { Between, MoreThanOrEqual, LessThanOrEqual } from '../lib/typeorm';

const inventoryRepository = AppDataSource.getRepository(InventoryRecord);
const customerRepository = AppDataSource.getRepository(Customer);
const deliveryOrderRepository = AppDataSource.getRepository(DeliveryOrder);
const productRepository = AppDataSource.getRepository(Product);

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
    }

    // 1. Pending Audits
    const pendingReviewCount = await inventoryRepository.count({
      where: { status: InventoryRecordStatus.PENDING }
    });

    // 2. Total Production Value (in range)
    const productionRecords = await inventoryRepository.find({
      where: { createdAt: Between(startOfRange, endOfRange) }
    });
    const totalProductionValue = productionRecords.reduce((sum, r) => sum + Number(r.totalAmount), 0);

    // 3. Product Growth (Today vs Yesterday)
    const products = await productRepository.find({ where: { isActive: true } });
    
    const todayRecords = await inventoryRepository.find({
      where: { createdAt: Between(startOfDay, endOfDay) },
      relations: ['product']
    });

    const yesterdayRecords = await inventoryRepository.find({
      where: { createdAt: Between(startOfYesterday, endOfYesterday) },
      relations: ['product']
    });

    const productGrowth = products.map(product => {
      const todayQty = todayRecords
        .filter(r => r.productId === product.id)
        .reduce((sum, r) => sum + r.quantity, 0);
        
      const yesterdayQty = yesterdayRecords
        .filter(r => r.productId === product.id)
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
    res.status(500).json({ message: '服务器错误', error });
  }
};

export const getSalesStats = async (req: AuthRequest, res: Response) => {
  try {
    const { timeRange = 'month' } = req.query;
    const now = new Date();
    
    let startOfRange: Date;
    let endOfRange: Date;

    if (timeRange === 'year') {
      startOfRange = new Date(now.getFullYear(), 0, 1);
      endOfRange = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    } else {
      // Default month
      startOfRange = new Date(now.getFullYear(), now.getMonth(), 1);
      endOfRange = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    // Convert to YYYY-MM-DD for deliveryDate query
    const startDateStr = startOfRange.toISOString().split('T')[0];
    const endDateStr = endOfRange.toISOString().split('T')[0];

    const orders = await deliveryOrderRepository.find({
      where: {
        deliveryDate: Between(startDateStr, endDateStr)
      }
    });

    const totalSales = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
    
    const settledAmount = orders.reduce((sum, o) => {
      if (o.status === DeliveryOrderStatus.SETTLED) {
        return sum + Number(o.totalAmount);
      } else if (o.status === DeliveryOrderStatus.PARTIAL) {
        return sum + Number(o.paidAmount || 0);
      }
      return sum;
    }, 0);

    res.json({
      totalSales,
      settledAmount
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误', error });
  }
};

export const getCustomerStats = async (req: AuthRequest, res: Response) => {
  try {
    const customers = await customerRepository.find({ where: { isActive: true } });
    const orders = await deliveryOrderRepository.find({ relations: ['customer'] }); // Fetch all orders to calculate total stats

    const customerStats = customers.map(customer => {
      const customerOrders = orders.filter(o => o.customerId === customer.id);
      
      const totalAmount = customerOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
      
      const pendingAmount = customerOrders.reduce((sum, o) => {
        if (o.status === DeliveryOrderStatus.PENDING) {
          return sum + Number(o.totalAmount);
        } else if (o.status === DeliveryOrderStatus.PARTIAL) {
          return sum + (Number(o.totalAmount) - Number(o.paidAmount || 0));
        }
        return sum;
      }, 0);

      return {
        id: customer.id,
        name: customer.name,
        totalAmount,
        pendingAmount
      };
    });

    // Sort by pending amount desc
    customerStats.sort((a, b) => b.pendingAmount - a.pendingAmount);

    res.json(customerStats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误', error });
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
      where: { createdAt: Between(startOfDay, endOfDay) }
    });
    const todayInventoryCount = todayRecords.reduce((sum, r) => sum + r.quantity, 0);

    const yesterdayRecords = await inventoryRepository.find({
      where: { createdAt: Between(startOfYesterday, endOfYesterday) }
    });
    const yesterdayInventoryCount = yesterdayRecords.reduce((sum, r) => sum + r.quantity, 0);

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
    const currentMonthDeliveryOrders = await deliveryOrderRepository.find({
      where: {
        deliveryDate: Between(startOfMonth.toISOString().split('T')[0], endOfMonth.toISOString().split('T')[0])
      }
    });
    const currentMonthOutputValue = currentMonthDeliveryOrders.reduce((sum, r) => sum + Number(r.totalAmount), 0);

    const lastMonthDeliveryOrders = await deliveryOrderRepository.find({
      where: {
        deliveryDate: Between(startOfLastMonth.toISOString().split('T')[0], endOfLastMonth.toISOString().split('T')[0])
      }
    });
    const lastMonthOutputValue = lastMonthDeliveryOrders.reduce((sum, r) => sum + Number(r.totalAmount), 0);

    let monthGrowthRate = 0;
    if (lastMonthOutputValue > 0) {
      monthGrowthRate = ((currentMonthOutputValue - lastMonthOutputValue) / lastMonthOutputValue) * 100;
    } else if (currentMonthOutputValue > 0) {
      monthGrowthRate = 100;
    }

    // 4. Active Customers (Total customers for now)
    const activeCustomerCount = await customerRepository.count();

    // 5. Recent Records (Last 5)
    const recentRecords = await inventoryRepository.find({
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
      recentRecords: recentRecords.map(r => ({
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
    res.status(500).json({ message: '服务器错误', error });
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
    const currentMonthWage = currentMonthRecords.reduce((sum, record) => sum + Number(record.totalAmount), 0);
    const approvedMonthCount = currentMonthRecords.length;

    // Last Month Wage (Approved)
    const lastMonthRecords = await inventoryRepository.find({
        where: {
            submitter: { id: userId },
            status: InventoryRecordStatus.APPROVED,
            createdAt: Between(startOfLastMonth, endOfLastMonth)
        }
    });
    const lastMonthWage = lastMonthRecords.reduce((sum, record) => sum + Number(record.totalAmount), 0);

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

    res.json({
      pendingCount,
      rejectedCount,
      approvedMonthCount,
      currentMonthWage,
      lastMonthWage,
      wageChangePercentage
    });

  } catch (error) {
    res.status(500).json({ message: '服务器错误', error });
  }
};
