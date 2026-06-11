import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Download, FileCheck, Plus, Trash2 } from 'lucide-react';
import ActionableEmptyState from '../components/ActionableEmptyState';
import DateField from '../components/DateField';
import ExportActionDialog from '../components/ExportActionDialog';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import { Company, Customer, CustomerType, DeliveryOrder, PaymentMethod, PaymentRecord, PurchaseOrder } from '../types';
import { groupDeliveryOrders } from '../utils/deliveryGrouping';
import { getPurchaseAmount, groupPurchases } from '../utils/purchaseGrouping';
import { formatAmount, formatDisplayDecimal, formatUnitPrice } from '../utils/format';
import api from '../utils/api';
import { createPdfFileFromElement, downloadPdfFile, sharePdfFile, toSafePdfFileName } from '../utils/printShare';

type StatementTypeFilter = 'all' | CustomerType.CLIENT | CustomerType.SUPPLIER;
type StatementBusinessMode = 'delivery' | 'purchase';

type StatementGroup = {
  customer: Customer | undefined;
  mode: StatementBusinessMode;
  orders: DeliveryOrder[];
  deliveryGroups: ReturnType<typeof groupDeliveryOrders>;
  purchases: PurchaseOrder[];
  purchaseGroups: ReturnType<typeof groupPurchases>;
  payments: PaymentRecord[];
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

const getPeriodBounds = (startDate: string, endDate: string) => ({
  start: startDate || getDefaultPeriodRange().startDate,
  end: endDate || getDefaultPeriodRange().endDate,
});

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

const normalizePaymentDate = (paymentDate: string) => paymentDate;

const Statement: React.FC = () => {
  const navigate = useNavigate();
  const [reconDateRange, setReconDateRange] = useState(getDefaultPeriodRange());
  const [reconCompanyId, setReconCompanyId] = useState('');
  const [selectedType, setSelectedType] = useState<StatementTypeFilter>('all');
  const [expandedCompanyIds, setExpandedCompanyIds] = useState<Set<string>>(new Set());
  const [expandedBusinessKeys, setExpandedBusinessKeys] = useState<Set<string>>(new Set());
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

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await api.get('/customers');
      return response.data as Customer[];
    },
  });

  const { data: deliveryOrders, isLoading: isLoadingOrders } = useQuery({
    queryKey: ['deliveryOrders', 'all'],
    queryFn: async () => {
      const response = await api.get('/delivery');
      return response.data as DeliveryOrder[];
    },
  });

  const { data: purchases, isLoading: isLoadingPurchases } = useQuery({
    queryKey: ['purchases'],
    queryFn: async () => {
      const response = await api.get('/purchases');
      return response.data as PurchaseOrder[];
    },
  });

  const { data: payments } = useQuery({
    queryKey: ['payments'],
    queryFn: async () => {
      const response = await api.get('/payments');
      return response.data as PaymentRecord[];
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
      queryClient.invalidateQueries({ queryKey: ['payments'] });
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
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });

  const paymentMethodLabels: Record<string, string> = {
    [PaymentMethod.PUBLIC_CASH]: '对公-现金',
    [PaymentMethod.PUBLIC_ACCEPTANCE]: '对公-承兑',
    [PaymentMethod.PRIVATE_ALIPAY]: '对私-支付宝',
    [PaymentMethod.PRIVATE_WECHAT]: '对私-微信',
    [PaymentMethod.PRIVATE_CARD]: '对私-卡号',
  };

  const availableCustomers = useMemo(() => {
    return (customers || []).filter((customer) => selectedType === 'all' || customer.type === selectedType);
  }, [customers, selectedType]);

  const groupedData = useMemo<StatementGroup[]>(() => {
    const { start, end } = getPeriodBounds(reconDateRange.startDate, reconDateRange.endDate);
    const groups: Record<string, StatementGroup> = {};

    (customers || []).forEach((customer) => {
      groups[customer.id] = {
        customer,
        mode: customer.type === CustomerType.SUPPLIER ? 'purchase' : 'delivery',
        orders: [],
        deliveryGroups: [],
        purchases: [],
        purchaseGroups: [],
        payments: [],
        totalBusiness: 0,
        totalPayment: 0,
        endingBalance: 0,
        periodBusiness: 0,
        periodPayment: 0,
      };
    });

    (deliveryOrders || []).forEach((order) => {
      const group = groups[order.customerId];
      if (!group || group.mode !== 'delivery') return;

      const amount = Number(order.totalAmount);
      group.totalBusiness += amount;

      if (order.deliveryDate <= end) {
        group.endingBalance += amount;
      }

      if (order.deliveryDate >= start && order.deliveryDate <= end) {
        group.orders.push(order);
        group.periodBusiness += amount;
      }
    });

    (purchases || []).forEach((purchase) => {
      if (!purchase.supplierId) return;
      const group = groups[purchase.supplierId];
      if (!group || group.mode !== 'purchase') return;

      const amount = getPurchaseAmount(purchase);
      group.totalBusiness += amount;

      if (purchase.purchaseDate <= end) {
        group.endingBalance += amount;
      }

      if (purchase.purchaseDate >= start && purchase.purchaseDate <= end) {
        group.purchases.push(purchase);
        group.periodBusiness += amount;
      }
    });

    (payments || []).forEach((payment) => {
      const group = groups[payment.customerId];
      if (!group) return;

      const amount = Number(payment.amount);
      group.totalPayment += amount;

      if (normalizePaymentDate(payment.paymentDate) <= end) {
        group.endingBalance -= amount;
      }

      if (normalizePaymentDate(payment.paymentDate) >= start && normalizePaymentDate(payment.paymentDate) <= end) {
        group.payments.push(payment);
        group.periodPayment += amount;
      }
    });

    Object.values(groups).forEach((group) => {
      group.orders.sort((a, b) => new Date(b.deliveryDate).getTime() - new Date(a.deliveryDate).getTime());
      group.purchases.sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());
      group.payments.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
      group.deliveryGroups = groupDeliveryOrders(group.orders);
      group.purchaseGroups = groupPurchases(group.purchases);
    });

    return Object.values(groups).filter((group) => {
      const isSelectedCustomer = Boolean(reconCompanyId) && group.customer?.id === reconCompanyId;

      if (reconCompanyId && !isSelectedCustomer) return false;
      if (selectedType !== 'all' && group.customer?.type !== selectedType) return false;
      if (isSelectedCustomer) return true;

      return (
        group.orders.length > 0 ||
        group.purchases.length > 0 ||
        group.payments.length > 0 ||
        Math.abs(group.endingBalance) > 0.0001
      );
    });
  }, [customers, deliveryOrders, payments, purchases, reconCompanyId, reconDateRange.endDate, reconDateRange.startDate, selectedType]);

  const printableStatement = useMemo<PrintableStatementData | null>(() => {
    if (!exportCustomerId) return null;

    const { start, end } = getPeriodBounds(reconDateRange.startDate, reconDateRange.endDate);
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
      periodStart: start,
      periodEnd: end,
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

  const selectedCustomerAvailableBalance = useMemo(() => {
    if (!selectedCustomerId || !newPayment.paymentDate) {
      return 0;
    }

    const customer = customers?.find((item) => item.id === selectedCustomerId);
    if (!customer) return 0;

    const totalBusiness =
      customer.type === CustomerType.SUPPLIER
        ? (purchases || []).reduce((sum, purchase) => {
            if (purchase.supplierId === selectedCustomerId && purchase.purchaseDate <= newPayment.paymentDate) {
              return sum + getPurchaseAmount(purchase);
            }
            return sum;
          }, 0)
        : (deliveryOrders || []).reduce((sum, order) => {
            if (order.customerId === selectedCustomerId && order.deliveryDate <= newPayment.paymentDate) {
              return sum + Number(order.totalAmount);
            }
            return sum;
          }, 0);

    const totalPayment = (payments || []).reduce((sum, payment) => {
      if (payment.customerId === selectedCustomerId && payment.paymentDate <= newPayment.paymentDate) {
        return sum + Number(payment.amount);
      }
      return sum;
    }, 0);

    return totalBusiness - totalPayment;
  }, [customers, deliveryOrders, newPayment.paymentDate, payments, purchases, selectedCustomerId]);

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

  const toggleBusinessExpand = (businessKey: string) => {
    const next = new Set(expandedBusinessKeys);
    if (next.has(businessKey)) {
      next.delete(businessKey);
    } else {
      next.add(businessKey);
    }
    setExpandedBusinessKeys(next);
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
      const file = await createPdfFileFromElement(printableStatementRef.current, {
        filename,
        orientation: 'portrait',
        marginMm: 12,
      });

      if (action === 'save') {
        downloadPdfFile(file);
        setExportCustomerId(null);
        return;
      }

      const result = await sharePdfFile(file, {
        title: filename.replace(/\.pdf$/i, ''),
        text: `${printableStatement.customer.name}的对账单`,
      });

      if (result === 'downloaded') {
        window.alert('当前浏览器无法直接分享到微信，已保存 PDF，可发送到微信。');
      }
      if (result !== 'cancelled') {
        setExportCustomerId(null);
      }
    } catch {
      window.alert('PDF 生成失败，请稍后重试。');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDateShortcut = (type: 'month' | 'year' | 'all') => {
    const today = new Date();
    let startDate = '';
    let endDate = '';

    if (type === 'month') {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
    } else if (type === 'year') {
      startDate = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
      endDate = new Date(today.getFullYear(), 11, 31).toISOString().split('T')[0];
    }

    setReconDateRange({ startDate, endDate });
  };

  const renderBusinessDetails = (group: StatementGroup) => {
    const labels = getStatementLabels(group.customer?.type);

    if (group.mode === 'purchase') {
      const purchaseGroup = group.purchaseGroups[0];

      return (
        <div>
          <h4 className="mb-3 text-sm font-medium text-gray-700">
            {labels.detailTitle} ({group.purchases.length})
          </h4>
          <div className="space-y-3">
            {purchaseGroup?.dates.map((dateGroup) => {
              const businessKey = `${group.customer?.id}:${dateGroup.date}`;
              const isExpanded = expandedBusinessKeys.has(businessKey);

              return (
                <div key={businessKey} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                  <div
                    className="flex cursor-pointer flex-col gap-3 px-4 py-3 transition-colors hover:bg-gray-50 md:flex-row md:items-start md:justify-between"
                    onClick={() => toggleBusinessExpand(businessKey)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 text-gray-400">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h5 className="text-sm font-semibold text-gray-900">{dateGroup.date}</h5>
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                            {dateGroup.purchases.length} 条材料记录
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-gray-500">当日总金额</div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">¥{formatAmount(dateGroup.totalAmount)}</div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-gray-200 px-4 py-3">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">品名</th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">数量</th>
                              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">单位</th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">单价</th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">金额</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">备注</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {dateGroup.purchases.map((purchase) => (
                              <tr key={purchase.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2 text-sm text-gray-900">{purchase.item}</td>
                                <td className="px-3 py-2 text-right text-sm text-gray-900">
                                  {formatDisplayDecimal(purchase.quantity, 4)}
                                </td>
                                <td className="px-3 py-2 text-center text-sm text-gray-500">{purchase.unit || '-'}</td>
                                <td className="px-3 py-2 text-right text-sm text-gray-900">{formatUnitPrice(purchase.unitPrice)}</td>
                                <td className="px-3 py-2 text-right text-sm font-medium text-gray-900">
                                  ¥{formatAmount(getPurchaseAmount(purchase))}
                                </td>
                                <td className="px-3 py-2 text-sm text-gray-500">{purchase.remark || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {(!purchaseGroup || purchaseGroup.dates.length === 0) && (
              <div className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
                无进货记录
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div>
        <h4 className="mb-3 text-sm font-medium text-gray-700">
          {labels.detailTitle} ({group.orders.length})
        </h4>
        <div className="space-y-3">
          {group.deliveryGroups[0]?.dates.flatMap((dateGroup) =>
            dateGroup.orders.map((orderGroup) => {
              const businessKey = orderGroup.order.id;
              const isExpanded = expandedBusinessKeys.has(businessKey);

              return (
                <div key={orderGroup.order.id} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                  <div
                    className="flex cursor-pointer flex-col gap-3 px-4 py-3 transition-colors hover:bg-gray-50 md:flex-row md:items-start md:justify-between"
                    onClick={() => toggleBusinessExpand(businessKey)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 text-gray-400">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-gray-500">{dateGroup.date}</span>
                          <h5 className="text-sm font-semibold text-gray-900">{orderGroup.order.orderNumber}</h5>
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                            {orderGroup.items.length} 项明细
                          </span>
                        </div>
                        {orderGroup.order.remark && (
                          <p className="mt-2 text-xs text-gray-500">备注：{orderGroup.order.remark}</p>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-gray-500">本单金额</div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">¥{formatAmount(orderGroup.totalAmount)}</div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-gray-200 px-4 py-3">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">产品名称</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">规格</th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">数量</th>
                              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">单位</th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">单价</th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">金额</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {orderGroup.items.map((item) => (
                              <tr key={item.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2 text-sm text-gray-900">{item.product?.name || '-'}</td>
                                <td className="px-3 py-2 text-sm text-gray-500">{item.product?.specification || '-'}</td>
                                <td className="px-3 py-2 text-right text-sm text-gray-900">
                                  {formatDisplayDecimal(item.quantity, 4)}
                                </td>
                                <td className="px-3 py-2 text-center text-sm text-gray-500">{item.product?.unit || '-'}</td>
                                <td className="px-3 py-2 text-right text-sm text-gray-900">{formatUnitPrice(item.unitPrice)}</td>
                                <td className="px-3 py-2 text-right text-sm font-medium text-gray-900">
                                  ¥{formatAmount(item.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            }),
          )}

          {(!group.deliveryGroups[0] || group.deliveryGroups[0].dates.length === 0) && (
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
              无送货记录
            </div>
          )}
        </div>
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

      <PageHeader title="对账单管理" subtitle="管理客户与供应商对账、付款和打印" />

      <div className="statement-page space-y-6 p-8">
        <div className="statement-screen-filters rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">类型筛选</label>
              <select
                value={selectedType}
                onChange={(event) => {
                  setSelectedType(event.target.value as StatementTypeFilter);
                  setReconCompanyId('');
                }}
                className="block w-40 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
              >
                <option value="all">全部</option>
                <option value={CustomerType.CLIENT}>客户</option>
                <option value={CustomerType.SUPPLIER}>供应商</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">开始日期</label>
              <DateField
                value={reconDateRange.startDate}
                onChange={(value) => setReconDateRange({ ...reconDateRange, startDate: value })}
                className="w-full"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">结束日期</label>
              <DateField
                value={reconDateRange.endDate}
                onChange={(value) => setReconDateRange({ ...reconDateRange, endDate: value })}
                className="w-full"
              />
            </div>

            <div className="flex gap-2 pb-0.5">
              <button
                onClick={() => handleDateShortcut('month')}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                本月
              </button>
              <button
                onClick={() => handleDateShortcut('year')}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                今年
              </button>
              <button
                onClick={() => handleDateShortcut('all')}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                全部
              </button>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">往来方</label>
              <select
                value={reconCompanyId}
                onChange={(event) => setReconCompanyId(event.target.value)}
                className="block w-48 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
              >
                <option value="">所有往来方</option>
                {availableCustomers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="statement-screen-list overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {isLoadingOrders || isLoadingPurchases ? (
            <div className="p-8 text-center text-gray-500">加载中...</div>
          ) : groupedData.length === 0 ? (
            <div className="p-6">
              <ActionableEmptyState
                icon={FileCheck}
                title={(deliveryOrders || []).length || (purchases || []).length ? '没有符合筛选条件的对账记录' : '先创建业务单据，再生成对账'}
                description={(deliveryOrders || []).length || (purchases || []).length ? '当前筛选条件下没有应收或应付记录，清除筛选后可查看全部往来方。' : '对账数据来自送货单、采购记录和付款记录。冷启动时先创建第一张送货单。'}
                actionLabel={(deliveryOrders || []).length || (purchases || []).length ? '清除筛选' : '去创建送货单'}
                onAction={() => {
                  if ((deliveryOrders || []).length || (purchases || []).length) {
                    setSelectedType('all');
                    setReconCompanyId('');
                    setReconDateRange({ startDate: '', endDate: '' });
                    return;
                  }
                  navigate('/delivery');
                }}
                secondaryLabel="去客户管理"
                onSecondaryAction={() => navigate('/customers')}
              />
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {groupedData.map((group) => {
                const companyId = group.customer?.id || 'unknown';
                const isExpanded = expandedCompanyIds.has(companyId);
                const labels = getStatementLabels(group.customer?.type);

                return (
                  <div key={companyId} className="bg-white">
                    <div
                      className="flex cursor-pointer items-center justify-between px-6 py-4 hover:bg-gray-50"
                      onClick={() => toggleCompanyExpand(companyId)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-gray-400">
                          {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                        </div>
                        <div>
                          <h3 className="flex items-center gap-2 text-lg font-medium text-gray-900">
                            {group.customer?.name}
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-500">
                              {group.customer?.type === CustomerType.CLIENT ? '客户' : '供应商'}
                            </span>
                          </h3>
                          <p className="text-sm text-gray-500">
                            {labels.periodBusiness}: ¥{formatAmount(group.periodBusiness)} | 本期付款: ¥{formatAmount(group.periodPayment)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-8">
                        <div className="text-right">
                          <p className="text-sm text-gray-500">{labels.totalBusiness}</p>
                          <p className="text-lg font-bold text-gray-900">¥{formatAmount(group.totalBusiness)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-500">累计已付</p>
                          <p className="text-lg font-bold text-green-600">¥{formatAmount(group.totalPayment)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-500">{labels.balance}</p>
                          <p className={`text-lg font-bold ${group.endingBalance >= 0 ? 'text-red-600' : 'text-blue-600'}`}>
                            ¥{formatAmount(group.endingBalance)}
                          </p>
                        </div>

                        <button
                          onClick={(event) => handleOpenStatementExport(companyId, event)}
                          className="flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
                        >
                          <Download className="h-4 w-4" />
                          导出对账单
                        </button>

                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedCustomerId(companyId);
                            setPaymentSubmitError('');
                            setShowPaymentModal(true);
                          }}
                          className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
                        >
                          <Plus className="h-4 w-4" />
                          登记付款
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="grid grid-cols-1 gap-6 border-t border-gray-100 bg-gray-50 px-6 py-4 lg:grid-cols-2">
                        {renderBusinessDetails(group)}

                        <div>
                          <h4 className="mb-3 text-sm font-medium text-gray-700">本期付款记录 ({group.payments.length})</h4>
                          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">日期</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">方式</th>
                                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">金额</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">备注</th>
                                  <th className="w-10 px-3 py-2"></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {group.payments.map((payment) => (
                                  <tr key={payment.id} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 text-sm text-gray-500">{payment.paymentDate}</td>
                                    <td className="px-3 py-2 text-sm text-gray-900">{paymentMethodLabels[payment.method]}</td>
                                    <td className="px-3 py-2 text-right text-sm font-medium text-green-600">
                                      ¥{formatAmount(payment.amount)}
                                    </td>
                                    <td className="max-w-[120px] truncate px-3 py-2 text-sm text-gray-500">{payment.remarks || '-'}</td>
                                    <td className="px-3 py-2 text-center">
                                      <button onClick={() => handleDeletePayment(payment.id)} className="text-gray-400 hover:text-red-600">
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                                {group.payments.length === 0 && (
                                  <tr>
                                    <td colSpan={5} className="px-3 py-4 text-center text-sm text-gray-500">
                                      无付款记录
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {printableStatement && (() => {
          const labels = getStatementLabels(printableStatement.customerType);
          return (
            <>
              <ExportActionDialog
                title="导出对账单"
                description={`为 ${printableStatement.customer.name} 保存 PDF，或在手机端分享到微信。`}
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
                          <th className="border border-gray-900 px-2 py-2 text-center font-semibold">数量</th>
                          <th className="border border-gray-900 px-2 py-2 text-center font-semibold">单位</th>
                          <th className="border border-gray-900 px-2 py-2 text-center font-semibold">单价</th>
                          <th className="border border-gray-900 px-2 py-2 text-center font-semibold">金额</th>
                        </tr>
                      </thead>
                      <tbody>
                        {printableStatement.purchaseDates.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="border border-gray-900 px-3 py-4 text-center text-gray-500">
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
                                <td className="border border-gray-900 px-2 py-2 text-center align-top">{printFieldValue(purchase.unit)}</td>
                                <td className="border border-gray-900 px-2 py-2 text-right align-top">{formatUnitPrice(purchase.unitPrice)}</td>
                                <td className="border border-gray-900 px-2 py-2 text-right align-top">
                                  ¥{formatAmount(getPurchaseAmount(purchase))}
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
                          <th className="border border-gray-900 px-2 py-2 text-center font-semibold">产品名称</th>
                          <th className="border border-gray-900 px-2 py-2 text-center font-semibold">规格</th>
                          <th className="border border-gray-900 px-2 py-2 text-center font-semibold">数量</th>
                          <th className="border border-gray-900 px-2 py-2 text-center font-semibold">单位</th>
                          <th className="border border-gray-900 px-2 py-2 text-center font-semibold">单价</th>
                          <th className="border border-gray-900 px-2 py-2 text-center font-semibold">金额</th>
                        </tr>
                      </thead>
                      <tbody>
                        {printableStatement.deliveryDates.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="border border-gray-900 px-3 py-4 text-center text-gray-500">
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
                                      {printFieldValue(item.product?.name)}
                                    </td>
                                    <td className="border border-gray-900 px-2 py-2 align-top">
                                      {printFieldValue(item.product?.specification)}
                                    </td>
                                    <td className="border border-gray-900 px-2 py-2 text-right align-top">
                                      {formatDisplayDecimal(item.quantity, 4)}
                                    </td>
                                    <td className="border border-gray-900 px-2 py-2 text-center align-top">
                                      {printFieldValue(item.product?.unit)}
                                    </td>
                                    <td className="border border-gray-900 px-2 py-2 text-right align-top">
                                      {formatUnitPrice(item.unitPrice)}
                                    </td>
                                    <td className="border border-gray-900 px-2 py-2 text-right align-top">
                                      ¥{formatAmount(item.amount)}
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
        <div className="statement-payment-modal fixed inset-0 h-full w-full overflow-y-auto bg-gray-600 bg-opacity-50">
          <div className="relative top-20 mx-auto w-96 rounded-md border bg-white p-5 shadow-lg">
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

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => {
                  setPaymentSubmitError('');
                  setShowPaymentModal(false);
                }}
                className="mr-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleAddPayment}
                className="rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
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
