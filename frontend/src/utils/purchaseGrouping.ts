import { PurchaseOrder } from '../types';

export type PurchaseMaterialRow = PurchaseOrder;

export type PurchaseDateGroup = {
  date: string;
  purchases: PurchaseMaterialRow[];
  rowCount: number;
  totalAmount: number;
};

export type PurchaseSupplierGroup = {
  supplierKey: string;
  supplierId?: string | null;
  supplierName: string;
  purchases: PurchaseMaterialRow[];
  dates: PurchaseDateGroup[];
  rowCount: number;
  totalAmount: number;
  purchaseCount: number;
};

type GroupPurchasesOptions = {
  purchaseFilter?: (purchase: PurchaseOrder) => boolean;
};

const compareDateDesc = (left: string, right: string) => right.localeCompare(left);

export const getPurchaseAmount = (purchase: PurchaseOrder) => {
  if (purchase.amount !== undefined && purchase.amount !== null) {
    return Number(purchase.amount);
  }

  return Number(purchase.quantity) * Number(purchase.unitPrice || 0);
};

const getSupplierKey = (purchase: PurchaseOrder) => {
  if (purchase.supplierId) {
    return purchase.supplierId;
  }

  return `legacy:${purchase.supplier || purchase.supplierEntity?.name || '未关联供应商'}`;
};

const getSupplierName = (purchase: PurchaseOrder) => {
  return purchase.supplierEntity?.name || purchase.supplier || '未关联供应商';
};

export const groupPurchases = (
  purchases: PurchaseOrder[],
  options: GroupPurchasesOptions = {},
): PurchaseSupplierGroup[] => {
  const supplierMap = new Map<string, PurchaseSupplierGroup>();
  const { purchaseFilter } = options;

  [...purchases]
    .sort((a, b) => {
      const dateCompare = compareDateDesc(a.purchaseDate, b.purchaseDate);
      if (dateCompare !== 0) return dateCompare;
      return (a.item || '').localeCompare(b.item || '', 'zh-CN');
    })
    .forEach((purchase) => {
      if (purchaseFilter && !purchaseFilter(purchase)) {
        return;
      }

      const supplierKey = getSupplierKey(purchase);
      let supplierGroup = supplierMap.get(supplierKey);

      if (!supplierGroup) {
        supplierGroup = {
          supplierKey,
          supplierId: purchase.supplierId || purchase.supplierEntity?.id || null,
          supplierName: getSupplierName(purchase),
          purchases: [],
          dates: [],
          rowCount: 0,
          totalAmount: 0,
          purchaseCount: 0,
        };
        supplierMap.set(supplierKey, supplierGroup);
      }

      supplierGroup.purchases.push(purchase);

      let dateGroup = supplierGroup.dates.find((item) => item.date === purchase.purchaseDate);
      if (!dateGroup) {
        dateGroup = {
          date: purchase.purchaseDate,
          purchases: [],
          rowCount: 0,
          totalAmount: 0,
        };
        supplierGroup.dates.push(dateGroup);
      }

      const purchaseAmount = getPurchaseAmount(purchase);
      dateGroup.purchases.push(purchase);
      dateGroup.rowCount += 1;
      dateGroup.totalAmount += purchaseAmount;

      supplierGroup.rowCount += 1;
      supplierGroup.totalAmount += purchaseAmount;
      supplierGroup.purchaseCount += 1;
    });

  return Array.from(supplierMap.values())
    .map((supplierGroup) => ({
      ...supplierGroup,
      dates: supplierGroup.dates
        .map((dateGroup) => ({
          ...dateGroup,
          purchases: [...dateGroup.purchases].sort((a, b) => (a.item || '').localeCompare(b.item || '', 'zh-CN')),
        }))
        .sort((a, b) => compareDateDesc(a.date, b.date)),
    }))
    .sort((a, b) => a.supplierName.localeCompare(b.supplierName, 'zh-CN'));
};
