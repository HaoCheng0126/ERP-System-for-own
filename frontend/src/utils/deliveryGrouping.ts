import { DeliveryOrder, DeliveryOrderItem } from '../types';

export type DeliveryOrderGroup = {
  order: DeliveryOrder;
  items: DeliveryOrderItem[];
  rowCount: number;
  totalAmount: number;
};

export type DeliveryDateGroup = {
  date: string;
  orders: DeliveryOrderGroup[];
  rowCount: number;
  totalAmount: number;
  orderCount: number;
};

export type DeliveryCompanyGroup = {
  customerId: string;
  customerName: string;
  dates: DeliveryDateGroup[];
  rowCount: number;
  totalAmount: number;
  orderCount: number;
};

type GroupDeliveryOrdersOptions = {
  itemFilter?: (item: DeliveryOrderItem, order: DeliveryOrder) => boolean;
};

const compareDateDesc = (left: string, right: string) => right.localeCompare(left);

export const getDeliveryItemAmount = (item: DeliveryOrderItem) => {
  if (item.amount !== undefined && item.amount !== null) {
    return Number(item.amount);
  }
  return Number(item.quantity) * Number(item.unitPrice);
};

export const groupDeliveryOrders = (
  orders: DeliveryOrder[],
  options: GroupDeliveryOrdersOptions = {},
): DeliveryCompanyGroup[] => {
  const companyMap = new Map<string, DeliveryCompanyGroup>();
  const { itemFilter } = options;

  [...orders]
    .sort((a, b) => {
      const dateCompare = compareDateDesc(a.deliveryDate, b.deliveryDate);
      if (dateCompare !== 0) return dateCompare;
      return a.orderNumber.localeCompare(b.orderNumber, 'zh-CN');
    })
    .forEach((order) => {
      const visibleItems = itemFilter ? order.items.filter((item) => itemFilter(item, order)) : order.items;
      if (visibleItems.length === 0) {
        return;
      }

      const customerId = order.customerId || order.customer?.id || 'unknown-company';
      let companyGroup = companyMap.get(customerId);

      if (!companyGroup) {
        companyGroup = {
          customerId,
          customerName: order.customer?.name || '未命名客户',
          dates: [],
          rowCount: 0,
          totalAmount: 0,
          orderCount: 0,
        };
        companyMap.set(customerId, companyGroup);
      }

      let dateGroup = companyGroup.dates.find((item) => item.date === order.deliveryDate);
      if (!dateGroup) {
        dateGroup = {
          date: order.deliveryDate,
          orders: [],
          rowCount: 0,
          totalAmount: 0,
          orderCount: 0,
        };
        companyGroup.dates.push(dateGroup);
      }

      const totalAmount = visibleItems.reduce((sum, item) => sum + getDeliveryItemAmount(item), 0);
      const rowCount = Math.max(visibleItems.length, 1);

      dateGroup.orders.push({
        order,
        items: visibleItems,
        rowCount,
        totalAmount,
      });
      dateGroup.rowCount += rowCount;
      dateGroup.totalAmount += totalAmount;
      dateGroup.orderCount += 1;

      companyGroup.rowCount += rowCount;
      companyGroup.totalAmount += totalAmount;
      companyGroup.orderCount += 1;
    });

  return Array.from(companyMap.values())
    .map((companyGroup) => ({
      ...companyGroup,
      dates: companyGroup.dates
        .map((dateGroup) => ({
          ...dateGroup,
          orders: [...dateGroup.orders].sort((a, b) => {
            const dateCompare = compareDateDesc(a.order.deliveryDate, b.order.deliveryDate);
            if (dateCompare !== 0) return dateCompare;
            return a.order.orderNumber.localeCompare(b.order.orderNumber, 'zh-CN');
          }),
        }))
        .sort((a, b) => compareDateDesc(a.date, b.date)),
    }))
    .sort((a, b) => a.customerName.localeCompare(b.customerName, 'zh-CN'));
};
