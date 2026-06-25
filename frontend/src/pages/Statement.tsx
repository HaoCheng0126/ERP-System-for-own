import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Download, FileCheck, Plus, Trash2 } from 'lucide-react';
import ActionableEmptyState from '../components/ActionableEmptyState';
import DateField from '../components/DateField';
import ExportActionDialog from '../components/ExportActionDialog';
import FilterPanel, { ActiveFilter, DateShortcutGroup, FilterField } from '../components/FilterPanel';
import Layout from '../components/Layout';
import { MobileActionBar, MobileField, MobileFieldGrid, MobileRecordCard } from '../components/MobileRecordCard';
import PageHeader from '../components/PageHeader';
import { Company, Customer, CustomerType, DeliveryOrder, PaymentMethod, PaymentRecord, PurchaseOrder, ReconciliationGroup, ReturnOrder } from '../types';
import { groupDeliveryOrders } from '../utils/deliveryGrouping';
import { getPurchaseAmount, groupPurchases } from '../utils/purchaseGrouping';
import { formatAmount, formatAmountDetail, formatDisplayDecimal, formatUnitPrice, unitLabel } from '../utils/format';
import { DateRangeShortcut, getDateRangeByShortcut } from '../utils/filtering';
import api from '../utils/api';
import { exportPrintable, getShareFallbackMessage, toSafePdfFileName } from '../utils/printShare';
import DisclosureSection from '../components/records/DisclosureSection';
import DateSectionHeader from '../components/records/DateSectionHeader';
import RecordsSummaryBar from '../components/records/RecordsSummaryBar';
import { useCounterparties } from '../hooks/useCounterparties';

type StatementTypeFilter = 'all' | CustomerType.CLIENT | CustomerType.SUPPLIER;
type StatementBusinessMode = 'delivery' | 'purchase';
type StatementActivityScope = 'all' | 'active' | 'balance';

type StatementGroup = {
  customer: Customer;
  mode: StatementBusinessMode;
  orders: DeliveryOrder[];
  deliveryGroups: ReturnType<typeof groupDeliveryOrders>;
  purchases: PurchaseOrder[];
  purchaseGroups: ReturnType<typeof groupPurchases>;
  payments: PaymentRecord[];
  returns: ReturnOrder[];
  totalBusiness: number;
  totalPayment: number;
  endingBalance: number;
  periodBusiness: number;
  periodPayment: number;
};

type PrintableStatementData = {
  company: Company | undefined;
  customer: Customer;
  customerType: CustomerType;
  periodStart: string;
  periodEnd: string;
  periodBusiness: number;
  periodPayment: number;
  endingBalance: number;
  payments: PaymentRecord[];
  deliveryDates: NonNullable<ReturnType<typeof groupDeliveryOrders>[number]>['dates'];
  purchaseDates: NonNullable<ReturnType<typeof groupPurchases>[number]>['dates'];
  generatedAt: string;
};

const getDefaultPeriodRange = () => ({
  startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
  endDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0],
});

const getPeriodDisplayValue = (value: string, fallback: string) => value || fallback;

const printFieldValue = (value?: string | number | null) => {
  if (value === undefined || value === null || value === '') {
    return '\u00A0';
  }
  return String(value);
};

const getStatementLabels = (type?: CustomerType) => {
  if (type === CustomerType.SUPPLIER) {
    return {
      periodBusiness: '本期进货',
      totalBusiness: '累计进货',
      balance: '期末应付',
      detailTitle: '本期进货明细',
      printDetailTitle: '进货明细',
      counterpartyLabel: '供应商名称：',
    };
  }

  return {
    periodBusiness: '本期送货',
    totalBusiness: '累计送货',
    balance: '期末结余',
    detailTitle: '本期送货单',
    printDetailTitle: '送货明细',
    counterpartyLabel: '客户名称：',
  };
};

const getCustomerTypeLabel = (type?: CustomerType) => (type === CustomerType.SUPPLIER ? '供应商' : '客户');

const Statement: React.FC = () => {
  const navigate = useNavigate();
  const [reconDateRange, setReconDateRange] = useState(getDefaultPeriodRange());
  const [selectedType, setSelectedType] = useState<StatementTypeFilter>('all');
  const [activityScope, setActivityScope] = useState<StatementActivityScope>('all');
  const [expandedCompanyIds, setExpandedCompanyIds] = useState<Set<string>>(new Set());
  const [exportCustomerId, setExportCustomerId] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [paymentSubmitError, setPaymentSubmitError] = useState('');
  const printableStatementRef = useRef<HTMLDivElement>(null);
  const [newPayment, setNewPayment] = useState({
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    method: PaymentMethod.PUBLIC_CASH,
    remarks: '',
  });

  const queryClient = useQueryClient();

  const { data: company } = useQuery<Company>({
    queryKey: ['company'],
    queryFn: async () => {
      const response = await api.get('/company');
      return response.data as Company;
    },
  });

  const { data: customers } = useCounterparties();

  const { data: reconciliationGroups, isLoading: isLoadingReconciliation, error: reconciliationError, refetch: refetchReconciliation } = useQuery({
    queryKey: ['reconciliation', reconDateRange, selectedType, activityScope],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (reconDateRange.startDate) params.append('startDate', reconDateRange.startDate);
      if (reconDateRange.endDate) params.append('endDate', reconDateRange.endDate);
      if (selectedType !== 'all') params.append('type', selectedType);
      if (activityScope !== 'all') params.append('activityScope', activityScope);
      const response = await api.get(`/statements/reconciliation?${params.toString()}`);
      return response.data as ReconciliationGroup[];
    },
  });

  const createPaymentMutation = useMutation({
    mutationFn: async (data: typeof newPayment & { customerId: string }) => {
      const response = await api.post('/payments', {
        ...data,
        amount: Number(data.amount),
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
      queryClient.invalidateQueries({ queryKey: ['customerBalance'] });
      queryClient.invalidateQueries({ queryKey: ['salesStats'] });
      queryClient.invalidateQueries({ queryKey: ['customerStats'] });
      setShowPaymentModal(false);
      setSelectedCustomerId('');
      setPaymentSubmitError('');
      setNewPayment({
        amount: '',
        paymentDate: new Date().toISOString().split('T')[0],
        method: PaymentMethod.PUBLIC_CASH,
        remarks: '',
      });
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || error?.message || '登记付款失败，请稍后重试';
      setPaymentSubmitError(message);
    },
  });

  const deletePaymentMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/payments/${id}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
      queryClient.invalidateQueries({ queryKey: ['customerBalance'] });
      queryClient.invalidateQueries({ queryKey: ['salesStats'] });
      queryClient.invalidateQueries({ queryKey: ['customerStats'] });
    },
  });

  const paymentMethodLabels: Record<string, string> = {
    [PaymentMethod.PUBLIC_CASH]: '对公-现金',
    [PaymentMethod.PUBLIC_ACCEPTANCE]: '对公-承兑',
    [PaymentMethod.PRIVATE_ALIPAY]: '对私-支付宝',
    [PaymentMethod.PRIVATE_WECHAT]: '对私-微信',
    [PaymentMethod.PRIVATE_CARD]: '对私-卡号',
  };

  const groupedData = useMemo<StatementGroup[]>(() => {
    return (reconciliationGroups || []).map((group) => {
      const nextGroup: StatementGroup = {
        customer: group.customer,
        mode: group.mode,
        orders: [...(group.orders || [])],
        deliveryGroups: [],
        purchases: [...(group.purchases || [])],
        purchaseGroups: [],
        payments: [...(group.payments || [])],
        returns: [...(group.returns || [])],
        totalBusiness: Number(group.totalBusiness || 0),
        totalPayment: Number(group.totalPayment || 0),
        endingBalance: Number(group.endingBalance || 0),
        periodBusiness: Number(group.periodBusiness || 0),
        periodPayment: Number(group.periodPayment || 0),
      };

      nextGroup.orders.sort((a, b) => new Date(b.deliveryDate).getTime() - new Date(a.deliveryDate).getTime());
      nextGroup.purchases.sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());
      nextGroup.payments.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
      nextGroup.deliveryGroups = groupDeliveryOrders(nextGroup.orders);
      nextGroup.purchaseGroups = groupPurchases(nextGroup.purchases);
      return nextGroup;
    });
  }, [reconciliationGroups]);

  // 汇总条跟随筛选：金额用「本期」口径（随日期范围/类型/有余额变化），而非一直显示累计全部。
  const statementSummaryStats = useMemo(
    () => [
      { label: '往来方', value: String(groupedData.length) },
      { label: '本期交易额', value: `¥${formatAmount(groupedData.reduce((sum, group) => sum + group.periodBusiness, 0))}` },
      { label: '本期收付', value: `¥${formatAmount(groupedData.reduce((sum, group) => sum + group.periodPayment, 0))}` },
    ],
    [groupedData],
  );

  const printableStatement = useMemo<PrintableStatementData | null>(() => {
    if (!exportCustomerId) return null;

    const group = groupedData.find((item) => item.customer?.id === exportCustomerId);
    const customer = group?.customer || customers?.find((item) => item.id === exportCustomerId);

    if (!customer) return null;

    const paymentRecords = [...(group?.payments || [])].sort((a, b) => {
      const dateCompare = a.paymentDate.localeCompare(b.paymentDate);
      if (dateCompare !== 0) return dateCompare;
      return a.createdAt.localeCompare(b.createdAt);
    });

    const deliveryCompanyGroup = groupDeliveryOrders(group?.orders || [])[0];
    const deliveryDates = deliveryCompanyGroup
      ? [...deliveryCompanyGroup.dates]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((dateGroup) => ({
            ...dateGroup,
            orders: [...dateGroup.orders].sort((a, b) => a.order.orderNumber.localeCompare(b.order.orderNumber, 'zh-CN')),
          }))
      : [];

    const purchaseSupplierGroup = groupPurchases(group?.purchases || [])[0];
    const purchaseDates = purchaseSupplierGroup
      ? [...purchaseSupplierGroup.dates]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((dateGroup) => ({
            ...dateGroup,
            purchases: [...dateGroup.purchases].sort((a, b) => a.item.localeCompare(b.item, 'zh-CN')),
          }))
      : [];

    return {
      company,
      customer,
      customerType: customer.type,
      periodStart: getPeriodDisplayValue(reconDateRange.startDate, '全部开始'),
      periodEnd: getPeriodDisplayValue(reconDateRange.endDate, '全部结束'),
      periodBusiness: group?.periodBusiness || 0,
      periodPayment: group?.periodPayment || 0,
      endingBalance: group?.endingBalance || 0,
      payments: paymentRecords,
      deliveryDates,
      purchaseDates,
      generatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    };
  }, [company, customers, groupedData, exportCustomerId, reconDateRange.endDate, reconDateRange.startDate]);

  const selectedCustomer = useMemo(
    () => customers?.find((customer) => customer.id === selectedCustomerId),
    [customers, selectedCustomerId],
  );

  const selectedCustomerGroup = useMemo(
    () => groupedData.find((group) => group.customer?.id === selectedCustomerId),
    [groupedData, selectedCustomerId],
  );

  const { data: selectedCustomerBalance } = useQuery({
    queryKey: ['customerBalance', selectedCustomerId, newPayment.paymentDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (newPayment.paymentDate) params.append('date', newPayment.paymentDate);
      const response = await api.get(`/payments/balance/${selectedCustomerId}?${params.toString()}`);
      return response.data as { balance: number };
    },
    enabled: Boolean(selectedCustomerId && newPayment.paymentDate),
  });

  const selectedCustomerAvailableBalance = Number(selectedCustomerBalance?.balance || 0);

  const selectedStatementLabels = getStatementLabels(selectedCustomer?.type);
  const enteredPaymentAmount = Number(newPayment.amount || 0);
  const paymentAmountExceedsBalance =
    Number.isFinite(enteredPaymentAmount) &&
    enteredPaymentAmount > 0 &&
    enteredPaymentAmount - selectedCustomerAvailableBalance > 0.0001;

  const toggleCompanyExpand = (companyId: string) => {
    const next = new Set(expandedCompanyIds);
    if (next.has(companyId)) {
      next.delete(companyId);
    } else {
      next.add(companyId);
    }
    setExpandedCompanyIds(next);
  };

  const handleAddPayment = () => {
    if (!selectedCustomerId) return;
    setPaymentSubmitError('');

    if (!Number.isFinite(enteredPaymentAmount) || enteredPaymentAmount <= 0) {
      setPaymentSubmitError('请输入正确的付款金额');
      return;
    }

    if (paymentAmountExceedsBalance) {
      setPaymentSubmitError('输入错误，请重新核对金额');
      return;
    }

    createPaymentMutation.mutate({ ...newPayment, customerId: selectedCustomerId });
  };

  const handleDeletePayment = (id: string) => {
    if (!window.confirm('确定要删除这条付款记录吗？')) return;
    deletePaymentMutation.mutate(id);
  };

  const handleOpenStatementExport = (customerId: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setExportCustomerId(customerId);
  };

  const handleStatementPdfExport = async (action: 'save' | 'share') => {
    if (!printableStatement || !printableStatementRef.current) return;

    setIsExportingPdf(true);
    const filename = toSafePdfFileName(
      `对账单_${printableStatement.customer.name}_${printableStatement.periodStart}至${printableStatement.periodEnd}`,
    );

    try {
      const result = await exportPrintable(
        printableStatementRef.current,
        {
          filename,
          orientation: 'portrait',
          marginMm: 12,
          title: filename.replace(/\.pdf$/i, ''),
          text: `${printableStatement.customer.name}的对账单`,
        },
        action,
      );

      if (result === 'fallback-download') {
        window.alert(getShareFallbackMessage());
      }
      if (result !== 'cancelled') {
        setExportCustomerId(null);
      }
    } catch {
      window.alert('导出失败，请稍后重试。');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDateShortcut = (shortcut: DateRangeShortcut) => {
    setReconDateRange(getDateRangeByShortcut(shortcut));
  };

  const clearFilters = () => {
    setSelectedType('all');
    setReconDateRange({ startDate: '', endDate: '' });
    setActivityScope('all');
  };

  const activeFilters: ActiveFilter[] = [
    selectedType !== 'all'
      ? {
          key: 'type',
          label: `类型: ${selectedType === CustomerType.CLIENT ? '客户' : '供应商'}`,
          onRemove: () => setSelectedType('all'),
        }
      : null,
    reconDateRange.startDate || reconDateRange.endDate
      ? {
          key: 'date',
          label: `日期: ${reconDateRange.startDate || '不限'} 至 ${reconDateRange.endDate || '不限'}`,
          onRemove: () => setReconDateRange({ startDate: '', endDate: '' }),
        }
      : null,
    activityScope !== 'all'
      ? {
          key: 'activityScope',
          label: '只看有余额',
          onRemove: () => setActivityScope('all'),
        }
      : null,
  ].filter((item): item is ActiveFilter => Boolean(item));

  const renderBusinessDetails = (group: StatementGroup) => {
    const labels = getStatementLabels(group.customer?.type);

    if (group.mode === 'purchase') {
      const purchaseGroup = group.purchaseGroups[0];

      return (
        <div>
          <h4 className="mb-3 text-sm font-medium text-ink-secondary">
            {labels.detailTitle} ({group.purchases.length})
          </h4>
          {!purchaseGroup || purchaseGroup.dates.length === 0 ? (
            <div className="rounded-xl border border-line bg-white px-4 py-8 text-center text-sm text-ink-tertiary">
              无进货记录
            </div>
          ) : (
            <div className="space-y-5">
              {purchaseGroup.dates.map((dateGroup) => (
                <div key={dateGroup.date} className="space-y-3">
                  <DateSectionHeader
                    date={dateGroup.date}
                    count={dateGroup.rowCount}
                    countLabel="条"
                    amount={dateGroup.totalAmount}
                    formatAmount={formatAmount}
                  />
                  <div className="overflow-hidden rounded-xl border border-line bg-white">
                    <div className="hidden overflow-x-auto md:block">
                      <table className="min-w-full">
                        <thead>
                          <tr className="border-b border-line bg-canvas text-ink-tertiary">
                            <th className="px-4 py-2.5 text-left text-xs font-medium">品名</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium">数量{unitLabel(dateGroup.purchases.map(p => p.unit))}</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium">单价</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium">金额</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium">备注</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line-soft">
                          {dateGroup.purchases.map((purchase) => (
                            <tr key={purchase.id} className="transition-colors hover:bg-brand-50/40">
                              <td className="px-4 py-2.5 text-sm text-ink">{purchase.item}</td>
                              <td className="px-4 py-2.5 text-right text-sm tabular-nums text-ink">
                                {formatDisplayDecimal(purchase.quantity, 4)}
                              </td>
                              <td className="px-4 py-2.5 text-right text-sm tabular-nums text-ink">
                                {formatUnitPrice(purchase.unitPrice)}
                              </td>
                              <td className="px-4 py-2.5 text-right text-sm font-medium tabular-nums text-ink">
                                ¥{formatAmountDetail(getPurchaseAmount(purchase))}
                              </td>
                              <td className="px-4 py-2.5 text-sm text-ink-secondary">{purchase.remark || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="space-y-3 p-3 md:hidden">
                      {dateGroup.purchases.map((purchase) => (
                        <MobileRecordCard key={purchase.id} className="border-line-soft shadow-none">
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-ink">{purchase.item}</div>
                              <div className="mt-1 text-xs text-ink-tertiary">{purchase.remark || '无备注'}</div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-xs text-ink-tertiary">金额</div>
                              <div className="text-base font-bold tabular-nums text-ink">¥{formatAmountDetail(getPurchaseAmount(purchase))}</div>
                            </div>
                          </div>
                          <MobileFieldGrid>
                            <MobileField label="数量" value={`${formatDisplayDecimal(purchase.quantity, 4)} ${purchase.unit || ''}`} />
                            <MobileField label="单价" value={formatUnitPrice(purchase.unitPrice)} align="right" />
                          </MobileFieldGrid>
                        </MobileRecordCard>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    const deliveryGroup = group.deliveryGroups[0];

    return (
      <div>
        <h4 className="mb-3 text-sm font-medium text-ink-secondary">
          {labels.detailTitle} ({group.orders.length})
        </h4>
        {!deliveryGroup || deliveryGroup.dates.length === 0 ? (
          <div className="rounded-xl border border-line bg-white px-4 py-8 text-center text-sm text-ink-tertiary">
            无送货记录
          </div>
        ) : (
          <div className="space-y-5">
            {deliveryGroup.dates.map((dateGroup) => (
              <div key={dateGroup.date} className="space-y-3">
                <DateSectionHeader
                  date={dateGroup.date}
                  count={dateGroup.orderCount}
                  countLabel="单"
                  amount={dateGroup.totalAmount}
                  formatAmount={formatAmount}
                />
                {dateGroup.orders.map((orderGroup) => {
                  const retAmt = Number(orderGroup.order.returnedAmount ?? 0);
                  const origAmt = Number(orderGroup.order.totalAmount);
                  const isFullyRet = retAmt > 0 && retAmt >= origAmt;
                  const isPartialRet = retAmt > 0 && retAmt < origAmt;
                  return (
                  <article key={orderGroup.order.id} className={`overflow-hidden rounded-xl border bg-white ${isFullyRet ? 'border-rose-100' : 'border-line'}`}>
                    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h5 className="text-sm font-semibold text-ink">{orderGroup.order.orderNumber}</h5>
                          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-600">
                            {orderGroup.items.length} 项明细
                          </span>
                          {isFullyRet && (
                            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600">已退货</span>
                          )}
                          {isPartialRet && (
                            <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-600">部分退货</span>
                          )}
                        </div>
                        {orderGroup.order.remark && (
                          <p className="mt-1.5 text-xs text-ink-tertiary">备注：{orderGroup.order.remark}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-ink-tertiary">本单金额</div>
                        {isFullyRet ? (
                          <>
                            <div className="text-sm font-semibold tabular-nums text-rose-500">¥0</div>
                            <div className="text-xs text-ink-tertiary line-through">原¥{formatAmountDetail(origAmt)}</div>
                          </>
                        ) : isPartialRet ? (
                          <>
                            <div className="text-sm font-semibold tabular-nums text-ink">¥{formatAmountDetail(origAmt - retAmt)}</div>
                            <div className="text-xs text-rose-400">已退¥{formatAmountDetail(retAmt)}</div>
                          </>
                        ) : (
                          <div className="text-sm font-semibold tabular-nums text-ink">¥{formatAmountDetail(orderGroup.totalAmount)}</div>
                        )}
                      </div>
                    </div>
                    <div className="border-t border-line-soft">
                      <div className="hidden overflow-x-auto md:block">
                        <table className="min-w-full">
                          <thead>
                            <tr className="border-b border-line bg-canvas text-ink-tertiary">
                              <th className="px-4 py-2.5 text-left text-xs font-medium">产品/规格</th>
                              <th className="px-4 py-2.5 text-right text-xs font-medium">数量{unitLabel(orderGroup.items.map(i => i.product?.unit))}</th>
                              <th className="px-4 py-2.5 text-right text-xs font-medium">单价</th>
                              <th className="px-4 py-2.5 text-right text-xs font-medium">金额</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line-soft">
                            {orderGroup.items.map((item) => (
                              <tr key={item.id} className="transition-colors hover:bg-brand-50/40">
                                <td className="px-4 py-2.5 text-sm text-ink">
                                  {[item.product?.name, item.product?.specification].filter(Boolean).join(' ') || '-'}
                                </td>
                                <td className="px-4 py-2.5 text-right text-sm tabular-nums text-ink">
                                  {formatDisplayDecimal(item.quantity, 4)}
                                </td>
                                <td className="px-4 py-2.5 text-right text-sm tabular-nums text-ink">{formatUnitPrice(item.unitPrice)}</td>
                                <td className="px-4 py-2.5 text-right text-sm font-medium tabular-nums text-ink">
                                  ¥{formatAmountDetail(item.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="space-y-3 p-3 md:hidden">
                        {orderGroup.items.map((item) => (
                          <MobileRecordCard key={item.id} className="border-line-soft shadow-none">
                            <div className="mb-3 flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-ink">{item.product?.name || '-'}</div>
                                <div className="mt-1 text-xs text-ink-tertiary">{item.product?.specification || '-'}</div>
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="text-xs text-ink-tertiary">金额</div>
                                <div className="text-base font-bold tabular-nums text-ink">¥{formatAmountDetail(item.amount)}</div>
                              </div>
                            </div>
                            <MobileFieldGrid>
                              <MobileField label="数量" value={`${formatDisplayDecimal(item.quantity, 4)} ${item.product?.unit || ''}`} />
                              <MobileField label="单价" value={formatUnitPrice(item.unitPrice)} align="right" />
                            </MobileFieldGrid>
                          </MobileRecordCard>
                        ))}
                      </div>
                    </div>
                  </article>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        {group.returns.length > 0 && (
          <div className="mt-4">
            <h4 className="mb-2 text-sm font-medium text-rose-600">退货 ({group.returns.length})</h4>
            <div className="space-y-2">
              {group.returns.map((ret) => (
                <div
                  key={ret.id}
                  className="flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50/50 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink">{ret.returnNumber}</div>
                    <div className="text-xs text-ink-tertiary">
                      {ret.returnDate} · {ret.items.length} 项
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-semibold tabular-nums text-rose-600">
                    −¥{formatAmountDetail(ret.totalAmount)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Layout>
      <style>{`
        .statement-print-layout {
          display: none;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm;
          }

          body {
            background: #ffffff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          aside,
          .statement-screen-filters,
          .statement-screen-list,
          .statement-payment-modal {
            display: none !important;
          }

          main {
            margin: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            overflow: visible !important;
          }

          main > div:first-child {
            display: none !important;
          }

          .statement-page {
            padding: 0 !important;
          }

          .statement-print-layout {
            display: block !important;
            width: 100% !important;
            padding: 0 !important;
            overflow: visible !important;
            box-sizing: border-box;
          }

          .statement-print-sheet {
            width: 100% !important;
            max-width: none !important;
            overflow: visible !important;
            box-sizing: border-box;
          }

          .statement-print-table {
            width: 100% !important;
            table-layout: fixed;
            font-size: 11px !important;
            box-sizing: border-box;
          }

          .statement-print-table thead {
            display: table-header-group;
          }

          .statement-print-table tr,
          .statement-print-table td,
          .statement-print-table th {
            page-break-inside: avoid;
            break-inside: avoid;
            box-sizing: border-box;
            overflow-wrap: anywhere;
            word-break: break-word;
          }
        }
      `}</style>

      <PageHeader title="对账单管理" />

      <div className="statement-page px-4 pb-4 pt-0 md:px-6 md:pb-6">
        <div className="-mx-4 overflow-hidden border-b border-line bg-white md:-mx-6">
        <div className="statement-screen-filters">
          <FilterPanel
            totalCount={(customers || []).length}
            filteredCount={groupedData.length}
            activeFilters={activeFilters}
            onClear={clearFilters}
            primary={
              <>
                <FilterField label="类型筛选" className="lg:w-40">
                  <select
                    value={selectedType}
                    onChange={(event) => setSelectedType(event.target.value as StatementTypeFilter)}
                    className="block min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink shadow-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="all">全部</option>
                    <option value={CustomerType.CLIENT}>客户</option>
                    <option value={CustomerType.SUPPLIER}>供应商</option>
                  </select>
                </FilterField>
                <FilterField label="开始日期" className="lg:w-40">
                  <DateField
                    value={reconDateRange.startDate}
                    onChange={(value) => setReconDateRange({ ...reconDateRange, startDate: value })}
                    className="w-full"
                  />
                </FilterField>
                <FilterField label="结束日期" className="lg:w-40">
                  <DateField
                    value={reconDateRange.endDate}
                    onChange={(value) => setReconDateRange({ ...reconDateRange, endDate: value })}
                    className="w-full"
                  />
                </FilterField>
                <FilterField label="快捷日期" className="sm:col-span-2 lg:w-56">
                  <DateShortcutGroup shortcuts={['month', 'year', 'all']} onSelect={handleDateShortcut} />
                </FilterField>
                <FilterField label="范围" className="sm:col-span-2 lg:w-auto">
                  <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink-secondary">
                    <input
                      type="checkbox"
                      checked={activityScope === 'balance'}
                      onChange={(event) => setActivityScope(event.target.checked ? 'balance' : 'all')}
                      className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-500"
                    />
                    只看有余额
                  </label>
                </FilterField>
              </>
            }
          />
        </div>

        <div className="statement-screen-list">
          {isLoadingReconciliation ? (
            <div className="p-8 text-center text-gray-500">加载中...</div>
          ) : reconciliationError ? (
            <div className="p-8 text-center">
              <p className="text-base font-medium text-gray-700">对账数据暂时无法同步</p>
              <button
                type="button"
                onClick={() => refetchReconciliation()}
                className="mt-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                重试
              </button>
            </div>
          ) : groupedData.length === 0 ? (
            <div className="p-6">
              <ActionableEmptyState
                icon={FileCheck}
                title={(customers || []).length ? '没有符合筛选条件的对账记录' : '先添加客户或供应商'}
                description={(customers || []).length ? '当前筛选条件下没有匹配的往来方，清除筛选后可查看全部客户和供应商。' : '对账管理会跟随客户管理自动显示往来方，再叠加送货、进货、付款和结余款项。'}
                actionLabel={(customers || []).length ? '清除筛选' : '去客户管理'}
                onAction={() => {
                  if ((customers || []).length) {
                    clearFilters();
                    return;
                  }
                  navigate('/customers');
                }}
              />
            </div>
          ) : (
            <div className="space-y-3 bg-[#F7F8FA] p-4 md:p-5">
              <RecordsSummaryBar stats={statementSummaryStats} />
              {groupedData.map((group) => {
                const companyId = group.customer?.id || 'unknown';
                const isExpanded = expandedCompanyIds.has(companyId);
                const labels = getStatementLabels(group.customer?.type);

                return (
                  <div
                    key={companyId}
                    className="overflow-hidden rounded-xl border border-line bg-white transition-shadow hover:shadow-card"
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      onClick={() => toggleCompanyExpand(companyId)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          toggleCompanyExpand(companyId);
                        }
                      }}
                      className="flex cursor-pointer flex-col gap-4 px-4 py-4 transition-colors hover:bg-canvas md:flex-row md:items-center md:justify-between md:px-5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-base font-semibold text-white shadow-sm ${
                            group.customer?.type === CustomerType.SUPPLIER
                              ? 'from-violet-500 to-[#A78BFA]'
                              : 'from-brand-500 to-[#7AA0FF]'
                          }`}
                        >
                          {group.customer?.name?.slice(0, 1) || '客'}
                        </span>
                        <div className="min-w-0">
                          <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
                            <span className="truncate">{group.customer?.name}</span>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                                group.customer?.type === CustomerType.SUPPLIER
                                  ? 'bg-violet-50 text-violet-600'
                                  : 'bg-brand-50 text-brand-600'
                              }`}
                            >
                              {getCustomerTypeLabel(group.customer?.type)}
                            </span>
                          </h3>
                          <p className="mt-1 text-xs text-ink-tertiary">
                            {labels.periodBusiness} ¥{formatAmount(group.periodBusiness)} · 本期付款 ¥{formatAmount(group.periodPayment)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
                        <div className="flex items-center justify-between gap-6 md:justify-end md:gap-7">
                          <div className="md:text-right">
                            <p className="text-xs text-ink-tertiary">{labels.totalBusiness}</p>
                            <p className="mt-0.5 text-lg font-bold tabular-nums text-ink">¥{formatAmount(group.totalBusiness)}</p>
                          </div>
                          <div className="md:text-right">
                            <p className="text-xs text-ink-tertiary">累计已付</p>
                            <p className="mt-0.5 text-lg font-bold tabular-nums text-emerald-600">¥{formatAmount(group.totalPayment)}</p>
                          </div>
                          <div className="md:text-right">
                            <p className="text-xs text-ink-tertiary">{labels.balance}</p>
                            <p className={`mt-0.5 text-lg font-bold tabular-nums ${group.endingBalance >= 0 ? 'text-rose-600' : 'text-brand-600'}`}>
                              ¥{formatAmount(group.endingBalance)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(event) => handleOpenStatementExport(companyId, event)}
                            className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink-secondary transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600 md:flex-none"
                          >
                            <Download className="h-4 w-4" />
                            导出
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedCustomerId(companyId);
                              setPaymentSubmitError('');
                              setShowPaymentModal(true);
                            }}
                            className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 md:flex-none"
                          >
                            <Plus className="h-4 w-4" />
                            登记付款
                          </button>
                          <ChevronDown
                            className={`hidden h-5 w-5 shrink-0 text-ink-tertiary transition-transform duration-300 motion-reduce:transition-none md:block ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </div>
                      </div>
                    </div>

                    <DisclosureSection open={isExpanded}>
                      <div className="grid grid-cols-1 gap-6 border-t border-line bg-canvas px-4 py-4 md:px-5 lg:grid-cols-2">
                        {renderBusinessDetails(group)}

                        <div>
                          <h4 className="mb-3 text-sm font-medium text-ink-secondary">本期付款记录 ({group.payments.length})</h4>
                          <div className="overflow-hidden rounded-xl border border-line bg-white">
                            <table className="hidden min-w-full md:table">
                              <thead>
                                <tr className="border-b border-line bg-canvas text-ink-tertiary">
                                  <th className="px-4 py-2.5 text-left text-xs font-medium">日期</th>
                                  <th className="px-4 py-2.5 text-left text-xs font-medium">方式</th>
                                  <th className="px-4 py-2.5 text-right text-xs font-medium">金额</th>
                                  <th className="px-4 py-2.5 text-left text-xs font-medium">备注</th>
                                  <th className="w-10 px-4 py-2.5"></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-line-soft">
                                {group.payments.map((payment) => (
                                  <tr key={payment.id} className="transition-colors hover:bg-brand-50/40">
                                    <td className="px-4 py-2.5 text-sm text-ink-secondary">{payment.paymentDate}</td>
                                    <td className="px-4 py-2.5 text-sm text-ink">{paymentMethodLabels[payment.method]}</td>
                                    <td className="px-4 py-2.5 text-right text-sm font-medium tabular-nums text-emerald-600">
                                      ¥{formatAmount(payment.amount)}
                                    </td>
                                    <td className="max-w-[120px] truncate px-4 py-2.5 text-sm text-ink-secondary">{payment.remarks || '-'}</td>
                                    <td className="px-4 py-2.5 text-center">
                                      <button onClick={() => handleDeletePayment(payment.id)} className="text-ink-tertiary transition-colors hover:text-rose-600">
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                                {group.payments.length === 0 && (
                                  <tr>
                                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-ink-tertiary">
                                      无付款记录
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                            <div className="space-y-3 p-3 md:hidden">
                              {group.payments.map((payment) => (
                                <MobileRecordCard key={payment.id} className="border-line-soft shadow-none">
                                  <div className="mb-3 flex items-start justify-between gap-3">
                                    <div>
                                      <div className="text-sm font-semibold text-ink">{payment.paymentDate}</div>
                                      <div className="mt-1 text-xs text-ink-tertiary">{paymentMethodLabels[payment.method]}</div>
                                    </div>
                                    <div className="text-right">
                                      <div className="text-xs text-ink-tertiary">金额</div>
                                      <div className="text-base font-bold tabular-nums text-emerald-600">¥{formatAmount(payment.amount)}</div>
                                    </div>
                                  </div>
                                  <MobileField label="备注" value={payment.remarks || '-'} />
                                  <MobileActionBar>
                                    <button
                                      type="button"
                                      onClick={() => handleDeletePayment(payment.id)}
                                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-100 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      删除
                                    </button>
                                  </MobileActionBar>
                                </MobileRecordCard>
                              ))}
                              {group.payments.length === 0 && (
                                <div className="px-3 py-4 text-center text-sm text-ink-tertiary">无付款记录</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </DisclosureSection>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>

        {printableStatement && (() => {
          const labels = getStatementLabels(printableStatement.customerType);
          return (
            <>
              <ExportActionDialog
                title="导出对账单"
                description={`为 ${printableStatement.customer.name} 生成 PDF 文件，可保存，或打开系统分享面板后选择微信。`}
                isProcessing={isExportingPdf}
                onSave={() => handleStatementPdfExport('save')}
                onShare={() => handleStatementPdfExport('share')}
                onClose={() => setExportCustomerId(null)}
              />

            <div ref={printableStatementRef} className="statement-print-layout">
              <div className="statement-print-sheet bg-white text-gray-900">
                <header className="border-b border-gray-900 pb-6">
                  <h1 className="text-center text-3xl font-semibold tracking-[0.12em]">
                    {printableStatement.company?.name || 'Kinko 企业'}
                  </h1>
                  <p className="mt-3 text-center text-sm text-gray-700">
                    {[printableStatement.company?.address, printableStatement.company?.phone ? `TEL: ${printableStatement.company.phone}` : '']
                      .filter(Boolean)
                      .join('   ') || '\u00A0'}
                  </p>

                  <div className="mt-8 grid grid-cols-2 gap-12 text-sm leading-8">
                    <div className="space-y-1">
                      <div className="grid grid-cols-[96px_1fr] gap-2">
                        <span className="font-medium">{labels.counterpartyLabel}</span>
                        <span>{printFieldValue(printableStatement.customer.name)}</span>
                      </div>
                      <div className="grid grid-cols-[96px_1fr] gap-2">
                        <span className="font-medium">联系人：</span>
                        <span>{printFieldValue(printableStatement.customer.contactPerson)}</span>
                      </div>
                      <div className="grid grid-cols-[96px_1fr] gap-2">
                        <span className="font-medium">联系电话：</span>
                        <span>{printFieldValue(printableStatement.customer.phone)}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="grid grid-cols-[96px_1fr] gap-2">
                        <span className="font-medium">对账区间：</span>
                        <span>{printFieldValue(`${printableStatement.periodStart} 至 ${printableStatement.periodEnd}`)}</span>
                      </div>
                      <div className="grid grid-cols-[96px_1fr] gap-2">
                        <span className="font-medium">税率：</span>
                        <span>{printFieldValue(printableStatement.company?.statementTaxLabel)}</span>
                      </div>
                      <div className="grid grid-cols-[96px_1fr] gap-2">
                        <span className="font-medium">结款模式：</span>
                        <span>{printFieldValue(printableStatement.company?.statementSettlementLabel)}</span>
                      </div>
                    </div>
                  </div>
                </header>

                <section className="mt-6 grid grid-cols-3 gap-4">
                  <div className="border border-gray-900 px-4 py-4">
                    <div className="text-xs tracking-[0.2em] text-gray-500">{labels.periodBusiness}总额</div>
                    <div className="mt-3 text-3xl font-semibold">¥{formatAmount(printableStatement.periodBusiness)}</div>
                  </div>
                  <div className="border border-gray-900 px-4 py-4">
                    <div className="text-xs tracking-[0.2em] text-gray-500">本期付款总额</div>
                    <div className="mt-3 text-3xl font-semibold">¥{formatAmount(printableStatement.periodPayment)}</div>
                  </div>
                  <div className="border border-gray-900 px-4 py-4">
                    <div className="text-xs tracking-[0.2em] text-gray-500">{labels.balance}</div>
                    <div className="mt-3 text-3xl font-semibold">¥{formatAmount(printableStatement.endingBalance)}</div>
                  </div>
                </section>

                <section className="mt-8">
                  <div className="mb-3 text-base font-semibold tracking-[0.16em]">付款明细</div>
                  <table className="statement-print-table w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className="border border-gray-900 px-3 py-2 text-center font-semibold">日期</th>
                        <th className="border border-gray-900 px-3 py-2 text-center font-semibold">付款方式</th>
                        <th className="border border-gray-900 px-3 py-2 text-center font-semibold">金额</th>
                        <th className="border border-gray-900 px-3 py-2 text-center font-semibold">备注</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printableStatement.payments.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="border border-gray-900 px-3 py-4 text-center text-gray-500">
                            本期无记录
                          </td>
                        </tr>
                      ) : (
                        printableStatement.payments.map((payment) => (
                          <tr key={payment.id}>
                            <td className="border border-gray-900 px-3 py-2 text-center">{payment.paymentDate}</td>
                            <td className="border border-gray-900 px-3 py-2">{paymentMethodLabels[payment.method]}</td>
                            <td className="border border-gray-900 px-3 py-2 text-right">¥{formatAmount(payment.amount)}</td>
                            <td className="border border-gray-900 px-3 py-2">{printFieldValue(payment.remarks)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </section>

                <section className="mt-8">
                  <div className="mb-3 text-base font-semibold tracking-[0.16em]">{labels.printDetailTitle}</div>
                  {printableStatement.customerType === CustomerType.SUPPLIER ? (
                    <table className="statement-print-table w-full border-collapse text-sm">
                      <thead>
                        <tr>
                          <th className="border border-gray-900 px-2 py-2 text-center font-semibold">日期</th>
                          <th className="border border-gray-900 px-2 py-2 text-center font-semibold">品名</th>
                          <th className="border border-gray-900 px-2 py-2 text-center font-semibold">数量{unitLabel(printableStatement.purchaseDates.flatMap(g => g.purchases).map(p => p.unit))}</th>
                          <th className="border border-gray-900 px-2 py-2 text-center font-semibold">单价</th>
                          <th className="border border-gray-900 px-2 py-2 text-center font-semibold">金额</th>
                        </tr>
                      </thead>
                      <tbody>
                        {printableStatement.purchaseDates.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="border border-gray-900 px-3 py-4 text-center text-gray-500">
                              本期无记录
                            </td>
                          </tr>
                        ) : (
                          printableStatement.purchaseDates.map((dateGroup) =>
                            dateGroup.purchases.map((purchase, purchaseIndex) => (
                              <tr key={purchase.id}>
                                {purchaseIndex === 0 && (
                                  <td rowSpan={dateGroup.rowCount} className="border border-gray-900 px-2 py-2 align-top text-center">
                                    {dateGroup.date}
                                  </td>
                                )}
                                <td className="border border-gray-900 px-2 py-2 align-top break-words">{printFieldValue(purchase.item)}</td>
                                <td className="border border-gray-900 px-2 py-2 text-right align-top">
                                  {formatDisplayDecimal(purchase.quantity, 4)}
                                </td>
                                <td className="border border-gray-900 px-2 py-2 text-right align-top">{formatUnitPrice(purchase.unitPrice)}</td>
                                <td className="border border-gray-900 px-2 py-2 text-right align-top">
                                  ¥{formatAmountDetail(getPurchaseAmount(purchase))}
                                </td>
                              </tr>
                            )),
                          )
                        )}
                      </tbody>
                    </table>
                  ) : (
                    <table className="statement-print-table w-full border-collapse text-sm">
                      <thead>
                        <tr>
                          <th className="border border-gray-900 px-2 py-2 text-center font-semibold">日期</th>
                          <th className="border border-gray-900 px-2 py-2 text-center font-semibold">单号</th>
                          <th className="border border-gray-900 px-2 py-2 text-center font-semibold">产品/规格</th>
                          <th className="border border-gray-900 px-2 py-2 text-center font-semibold">数量{unitLabel(printableStatement.deliveryDates.flatMap(g => g.orders).flatMap(o => o.items).map(i => i.product?.unit))}</th>
                          <th className="border border-gray-900 px-2 py-2 text-center font-semibold">单价</th>
                          <th className="border border-gray-900 px-2 py-2 text-center font-semibold">金额</th>
                        </tr>
                      </thead>
                      <tbody>
                        {printableStatement.deliveryDates.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="border border-gray-900 px-3 py-4 text-center text-gray-500">
                              本期无记录
                            </td>
                          </tr>
                        ) : (
                          printableStatement.deliveryDates.map((dateGroup) =>
                            dateGroup.orders.map((orderGroup, orderIndex) =>
                              orderGroup.items.map((item, itemIndex) => {
                                const showDate = orderIndex === 0 && itemIndex === 0;
                                const showOrder = itemIndex === 0;

                                return (
                                  <tr key={`${orderGroup.order.id}-${item.id || itemIndex}`}>
                                    {showDate && (
                                      <td rowSpan={dateGroup.rowCount} className="border border-gray-900 px-2 py-2 align-top text-center">
                                        {dateGroup.date}
                                      </td>
                                    )}
                                    {showOrder && (
                                      <td rowSpan={orderGroup.rowCount} className="border border-gray-900 px-2 py-2 align-top text-center">
                                        {orderGroup.order.orderNumber}
                                      </td>
                                    )}
                                    <td className="border border-gray-900 px-2 py-2 align-top break-words">
                                      {[item.product?.name, item.product?.specification].filter(Boolean).join(' ') || '-'}
                                    </td>
                                    <td className="border border-gray-900 px-2 py-2 text-right align-top">
                                      {formatDisplayDecimal(item.quantity, 4)}
                                    </td>
                                    <td className="border border-gray-900 px-2 py-2 text-right align-top">
                                      {formatUnitPrice(item.unitPrice)}
                                    </td>
                                    <td className="border border-gray-900 px-2 py-2 text-right align-top">
                                      ¥{formatAmountDetail(item.amount)}
                                    </td>
                                  </tr>
                                );
                              }),
                            ),
                          )
                        )}
                      </tbody>
                    </table>
                  )}
                </section>

                <footer className="mt-6 border-t border-gray-300 pt-4 text-right text-xs text-gray-500">
                  打印生成时间：{printableStatement.generatedAt}
                </footer>
              </div>
            </div>
            </>
          );
        })()}
      </div>

      {showPaymentModal && (
        <div className="statement-payment-modal fixed inset-0 z-50 flex items-end justify-center bg-gray-600 bg-opacity-50 sm:items-center">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border bg-white p-5 shadow-lg sm:w-96 sm:rounded-lg">
            <h3 className="mb-4 text-lg font-medium text-gray-900">登记付款</h3>
            <div className="space-y-4">
              {paymentSubmitError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {paymentSubmitError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700">付款日期</label>
                <DateField
                  value={newPayment.paymentDate}
                  onChange={(value) => {
                    setPaymentSubmitError('');
                    setNewPayment({ ...newPayment, paymentDate: value });
                  }}
                  className="mt-1 w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">金额</label>
                <input
                  type="number"
                  step="0.0001"
                  value={newPayment.amount}
                  onChange={(event) => {
                    setPaymentSubmitError('');
                    setNewPayment({ ...newPayment, amount: event.target.value });
                  }}
                  className={`mt-1 block w-full rounded-md border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm ${
                    paymentAmountExceedsBalance ? 'border-red-300 text-red-700' : 'border-gray-300'
                  }`}
                />
                <div className="mt-2 space-y-1 text-xs">
                  <p className="text-gray-500">
                    当前{selectedStatementLabels.balance}：¥{formatAmount(selectedCustomerGroup?.endingBalance || 0)}
                  </p>
                  <p className={paymentAmountExceedsBalance ? 'text-red-600' : 'text-gray-500'}>
                    按付款日期可登记余额：¥{formatAmount(selectedCustomerAvailableBalance)}
                  </p>
                  {paymentAmountExceedsBalance && <p className="text-red-600">输入错误，请重新核对金额</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">支付方式</label>
                <select
                  value={newPayment.method}
                  onChange={(event) => setNewPayment({ ...newPayment, method: event.target.value as PaymentMethod })}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                >
                  {Object.entries(paymentMethodLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">备注</label>
                <textarea
                  value={newPayment.remarks}
                  onChange={(event) => setNewPayment({ ...newPayment, remarks: event.target.value })}
                  rows={3}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                />
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={() => {
                  setPaymentSubmitError('');
                  setShowPaymentModal(false);
                }}
                className="min-h-11 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleAddPayment}
                className="min-h-11 rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              >
                确认登记
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Statement;
