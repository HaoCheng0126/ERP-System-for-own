import { AppDataSource } from '../config/database';
import {
  Customer,
  CustomerType,
  DeliveryOrder,
  PaymentRecord,
  PurchaseOrder,
  ReturnOrder,
} from '../entities';
import { roundCurrencyAmount } from '../utils/decimal';

type ReconciliationActivityScope = 'all' | 'active' | 'balance';

type ReconciliationFilters = {
  startDate?: string;
  endDate?: string;
  customerId?: string;
  type?: 'all' | CustomerType;
  activityScope?: ReconciliationActivityScope;
};

export type CounterpartyStat = {
  id: string;
  name: string;
  type: CustomerType;
  totalBusiness: number;
  totalPayment: number;
  endingBalance: number;
  statusLabel: string;
};

type ReconciliationGroup = {
  customer: Customer;
  mode: 'delivery' | 'purchase';
  orders: DeliveryOrder[];
  purchases: PurchaseOrder[];
  payments: PaymentRecord[];
  returns: ReturnOrder[];
  totalBusiness: number;
  totalPayment: number;
  endingBalance: number;
  periodBusiness: number;
  periodPayment: number;
};

const customerRepository = AppDataSource.getRepository(Customer);
const deliveryOrderRepository = AppDataSource.getRepository(DeliveryOrder);
const purchaseOrderRepository = AppDataSource.getRepository(PurchaseOrder);
const paymentRepository = AppDataSource.getRepository(PaymentRecord);
const returnOrderRepository = AppDataSource.getRepository(ReturnOrder);

const getPeriodBounds = (startDate?: string, endDate?: string) => ({
  start: startDate || '0000-01-01',
  end: endDate || '9999-12-31',
});

const normalizePaymentDate = (paymentDate: string | Date) =>
  typeof paymentDate === 'string' ? paymentDate : paymentDate.toISOString().split('T')[0];

const isNonZeroAmount = (value: number) => Math.abs(Number(value || 0)) > 0.0001;

const toAmount = (value: number) => roundCurrencyAmount(value);

const getCounterpartyStatusLabel = (type: CustomerType, endingBalance: number) => {
  if (endingBalance > 0.0001) {
    return type === CustomerType.SUPPLIER ? '待付款' : '需催款';
  }
  if (endingBalance < -0.0001) {
    return type === CustomerType.SUPPLIER ? '预付款' : '预收款';
  }
  return '已结清';
};

const toCounterpartyStat = (group: ReconciliationGroup): CounterpartyStat => ({
  id: group.customer.id,
  name: group.customer.name,
  type: group.customer.type,
  totalBusiness: toAmount(group.totalBusiness),
  totalPayment: toAmount(group.totalPayment),
  endingBalance: toAmount(group.endingBalance),
  statusLabel: getCounterpartyStatusLabel(group.customer.type, group.endingBalance),
});

export class AccountingService {
  async getReconciliation(filters: ReconciliationFilters = {}): Promise<ReconciliationGroup[]> {
    const { start, end } = getPeriodBounds(filters.startDate, filters.endDate);
    const typeFilter = filters.type && filters.type !== 'all' ? filters.type : undefined;
    const activityScope = filters.activityScope || 'all';

    const customers = await customerRepository.find({
      where: {
        isActive: true,
        ...(filters.customerId ? { id: filters.customerId } : {}),
        ...(typeFilter ? { type: typeFilter } : {}),
      },
      order: { type: 'ASC', name: 'ASC' },
    });
    const customerIds = new Set(customers.map((customer) => customer.id));

    const [deliveryOrders, purchases, payments, returnOrders] = await Promise.all([
      deliveryOrderRepository.find({
        relations: ['customer', 'items', 'items.product'],
        order: { deliveryDate: 'DESC', createdAt: 'DESC' },
      }),
      purchaseOrderRepository.find({
        relations: ['supplierEntity', 'product'],
        order: { purchaseDate: 'DESC', createdAt: 'DESC' },
      }),
      paymentRepository.find({
        relations: ['customer'],
        order: { paymentDate: 'DESC', createdAt: 'DESC' },
      }),
      returnOrderRepository.find({
        relations: ['customer', 'items', 'items.product'],
        order: { returnDate: 'DESC', createdAt: 'DESC' },
      }),
    ]);

    // 批量计算每张送货单的已退货金额，避免 N+1
    const returnedAmountMap = new Map<string, number>();
    for (const r of returnOrders) {
      if (r.deliveryOrderId) {
        returnedAmountMap.set(
          r.deliveryOrderId,
          (returnedAmountMap.get(r.deliveryOrderId) ?? 0) + Number(r.totalAmount || 0),
        );
      }
    }
    const deliveryOrdersWithReturns = deliveryOrders.map((o) => ({
      ...o,
      returnedAmount: returnedAmountMap.get(o.id) ?? 0,
    }));

    const groups = customers.map((customer) => {
      const isSupplier = customer.type === CustomerType.SUPPLIER;
      const groupOrders = isSupplier
        ? []
        : deliveryOrdersWithReturns.filter((order) => order.customerId === customer.id);
      const groupPurchases = isSupplier
        ? purchases.filter((purchase) => purchase.supplierId === customer.id)
        : [];
      const groupPayments = payments.filter((payment) => payment.customerId === customer.id);

      const periodOrders = groupOrders.filter((order) => order.deliveryDate >= start && order.deliveryDate <= end);
      const periodPurchases = groupPurchases.filter((purchase) => purchase.purchaseDate >= start && purchase.purchaseDate <= end);
      const periodPayments = groupPayments.filter((payment) => {
        const paymentDate = normalizePaymentDate(payment.paymentDate);
        return paymentDate >= start && paymentDate <= end;
      });

      // 客户退货：作为负的业务冲减应收（供应商侧不涉及退货）
      const groupReturns = isSupplier ? [] : returnOrders.filter((order) => order.customerId === customer.id);
      const periodReturns = groupReturns.filter((order) => order.returnDate >= start && order.returnDate <= end);
      const returnsTotal = groupReturns.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
      const returnsBeforeEnd = groupReturns.reduce(
        (sum, order) => (order.returnDate <= end ? sum + Number(order.totalAmount || 0) : sum),
        0,
      );
      const periodReturnsTotal = periodReturns.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);

      const totalBusiness =
        (isSupplier
          ? groupPurchases.reduce((sum, purchase) => sum + Number(purchase.amount || 0), 0)
          : groupOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)) - returnsTotal;
      const totalPayment = groupPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const businessBeforeEnd =
        (isSupplier
          ? groupPurchases.reduce((sum, purchase) => {
              if (purchase.purchaseDate <= end) return sum + Number(purchase.amount || 0);
              return sum;
            }, 0)
          : groupOrders.reduce((sum, order) => {
              if (order.deliveryDate <= end) return sum + Number(order.totalAmount || 0);
              return sum;
            }, 0)) - returnsBeforeEnd;
      const paymentBeforeEnd = groupPayments.reduce((sum, payment) => {
        if (normalizePaymentDate(payment.paymentDate) <= end) return sum + Number(payment.amount || 0);
        return sum;
      }, 0);
      const periodBusiness =
        (isSupplier
          ? periodPurchases.reduce((sum, purchase) => sum + Number(purchase.amount || 0), 0)
          : periodOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)) - periodReturnsTotal;
      const periodPayment = periodPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const endingBalance = Number(customer.initialBalance || 0) + businessBeforeEnd - paymentBeforeEnd;

      return {
        customer,
        mode: isSupplier ? 'purchase' as const : 'delivery' as const,
        orders: periodOrders,
        purchases: periodPurchases,
        payments: periodPayments,
        returns: periodReturns,
        totalBusiness,
        totalPayment,
        endingBalance,
        periodBusiness,
        periodPayment,
      };
    });

    return groups.filter((group) => {
      if (!customerIds.has(group.customer.id)) return false;
      if (activityScope === 'active' && !isNonZeroAmount(group.periodBusiness) && !isNonZeroAmount(group.periodPayment)) {
        return false;
      }
      if (activityScope === 'balance' && !isNonZeroAmount(group.endingBalance)) {
        return false;
      }
      return true;
    });
  }

  async getCustomerBalanceAtDate(customerId: string, cutoffDate: string) {
    const customer = await customerRepository.findOne({ where: { id: customerId, isActive: true } });
    if (!customer) {
      return null;
    }

    const groups = await this.getReconciliation({
      customerId,
      startDate: '',
      endDate: cutoffDate,
      activityScope: 'all',
      type: customer.type,
    });
    const group = groups[0];
    if (!group) {
      return null;
    }

    return {
      customer,
      initialBalance: Number(customer.initialBalance || 0),
      totalBusiness: group.totalBusiness,
      totalPayment: group.totalPayment,
      balance: group.endingBalance,
    };
  }

  async getCounterpartyStats(cutoffDate = '9999-12-31') {
    const groups = await this.getReconciliation({
      endDate: cutoffDate,
      activityScope: 'all',
      type: 'all',
    });

    const sortByBalance = (items: CounterpartyStat[]) =>
      [...items].sort((left, right) => Math.abs(right.endingBalance) - Math.abs(left.endingBalance));

    return {
      clients: sortByBalance(
        groups
          .filter((group) => group.customer.type === CustomerType.CLIENT)
          .map(toCounterpartyStat),
      ),
      suppliers: sortByBalance(
        groups
          .filter((group) => group.customer.type === CustomerType.SUPPLIER)
          .map(toCounterpartyStat),
      ),
    };
  }

  async getFinancialStats(startDate: string, endDate: string) {
    const groups = await this.getReconciliation({
      startDate,
      endDate,
      activityScope: 'all',
      type: 'all',
    });

    const clientGroups = groups.filter((group) => group.customer.type === CustomerType.CLIENT);
    const supplierGroups = groups.filter((group) => group.customer.type === CustomerType.SUPPLIER);
    const sum = (values: number[]) => values.reduce((total, value) => total + Number(value || 0), 0);

    return {
      salesAmount: toAmount(sum(clientGroups.map((group) => group.periodBusiness))),
      receivedAmount: toAmount(sum(clientGroups.map((group) => group.periodPayment))),
      receivableBalance: toAmount(sum(clientGroups.map((group) => group.endingBalance))),
      purchaseAmount: toAmount(sum(supplierGroups.map((group) => group.periodBusiness))),
      paidAmount: toAmount(sum(supplierGroups.map((group) => group.periodPayment))),
      payableBalance: toAmount(sum(supplierGroups.map((group) => group.endingBalance))),
    };
  }
}

export const accountingService = new AccountingService();
