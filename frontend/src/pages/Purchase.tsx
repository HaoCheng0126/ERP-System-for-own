import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Download, Edit, Trash2, X } from 'lucide-react';
import DateField from '../components/DateField';
import ExportActionDialog from '../components/ExportActionDialog';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import QueryStateBanner from '../components/QueryStateBanner';
import { Customer, CustomerType, PurchaseOrder } from '../types';
import { formatAmount, formatDisplayDecimal, formatEditableDecimal, formatUnitPrice } from '../utils/format';
import { getPurchaseAmount, groupPurchases } from '../utils/purchaseGrouping';
import api from '../utils/api';
import { createPdfFileFromElement, downloadPdfFile, sharePdfFile, toSafePdfFileName } from '../utils/printShare';

type PurchaseFormState = {
  purchaseDate: string;
  supplierId: string;
  item: string;
  quantity: string | number;
  unit: string;
  unitPrice: string | number;
  remark: string;
};

const createEmptyPurchaseForm = (): PurchaseFormState => ({
  purchaseDate: new Date().toISOString().split('T')[0],
  supplierId: '',
  item: '',
  quantity: '',
  unit: '个',
  unitPrice: '',
  remark: '',
});

const Purchase: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [filterDateRange, setFilterDateRange] = useState({
    startDate: '',
    endDate: '',
  });
  const [filterSupplierId, setFilterSupplierId] = useState('');
  const [filterItem, setFilterItem] = useState('');
  const [expandedSupplierKeys, setExpandedSupplierKeys] = useState<Set<string>>(new Set());
  const [exportSupplierKey, setExportSupplierKey] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const printablePurchaseRef = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState<PurchaseFormState>(createEmptyPurchaseForm());

  const queryClient = useQueryClient();

  const resetForm = () => {
    setFormData(createEmptyPurchaseForm());
    setIsEditing(false);
    setCurrentId(null);
    setShowModal(false);
  };

  const openCreateModal = () => {
    setFormData(createEmptyPurchaseForm());
    setIsEditing(false);
    setCurrentId(null);
    setShowModal(true);
  };

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await api.get('/customers');
      return response.data.filter((customer: Customer) => customer.type === CustomerType.SUPPLIER) as Customer[];
    },
  });

  const { data: purchases, isLoading, error, refetch } = useQuery({
    queryKey: ['purchases'],
    queryFn: async () => {
      const response = await api.get('/purchases');
      return response.data as PurchaseOrder[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: PurchaseFormState) => {
      const response = await api.post('/purchases', {
        purchaseDate: data.purchaseDate,
        supplierId: data.supplierId,
        item: data.item,
        quantity: Number(data.quantity),
        unit: data.unit,
        unitPrice: Number(data.unitPrice),
        remark: data.remark,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: PurchaseFormState }) => {
      const response = await api.put(`/purchases/${id}`, {
        purchaseDate: data.purchaseDate,
        supplierId: data.supplierId,
        item: data.item,
        quantity: Number(data.quantity),
        unit: data.unit,
        unitPrice: Number(data.unitPrice),
        remark: data.remark,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/purchases/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
    },
  });

  const handleEditPurchase = (purchase: PurchaseOrder) => {
    setFormData({
      purchaseDate: purchase.purchaseDate,
      supplierId: purchase.supplierId || purchase.supplierEntity?.id || '',
      item: purchase.item,
      quantity: formatEditableDecimal(purchase.quantity),
      unit: purchase.unit || '个',
      unitPrice: formatEditableDecimal(purchase.unitPrice),
      remark: purchase.remark || '',
    });
    setIsEditing(true);
    setCurrentId(purchase.id);
    setShowModal(true);
  };

  const handleDeletePurchase = (purchase: PurchaseOrder) => {
    if (!window.confirm('确定要删除这条采购记录吗？')) return;
    deleteMutation.mutate(purchase.id);
  };

  const handleCreateOrUpdate = () => {
    if (isEditing && currentId) {
      updateMutation.mutate({ id: currentId, data: formData });
      return;
    }

    createMutation.mutate(formData);
  };

  const handleOpenSupplierExport = (supplierKey: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setExportSupplierKey(supplierKey);
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
    } else {
      startDate = '';
      endDate = '';
    }

    setFilterDateRange({ startDate, endDate });
  };

  const baseFilteredPurchases = useMemo(() => {
    return (purchases || []).filter((purchase) => {
      const matchDate =
        (filterDateRange.startDate ? purchase.purchaseDate >= filterDateRange.startDate : true) &&
        (filterDateRange.endDate ? purchase.purchaseDate <= filterDateRange.endDate : true);
      const matchSupplier = filterSupplierId ? purchase.supplierId === filterSupplierId : true;
      return matchDate && matchSupplier;
    });
  }, [filterDateRange.endDate, filterDateRange.startDate, filterSupplierId, purchases]);

  const groupedPurchases = useMemo(() => {
    return groupPurchases(baseFilteredPurchases, {
      purchaseFilter: (purchase) => (filterItem ? purchase.item.toLowerCase().includes(filterItem.toLowerCase()) : true),
    });
  }, [baseFilteredPurchases, filterItem]);

  const printablePurchase = useMemo(() => {
    if (!exportSupplierKey) return null;

    const supplierGroup = groupedPurchases.find((item) => item.supplierKey === exportSupplierKey);
    if (!supplierGroup) return null;

    return {
      supplierGroup,
      generatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    };
  }, [groupedPurchases, exportSupplierKey]);

  const computedAmount = useMemo(() => {
    const quantity = Number(formData.quantity || 0);
    const unitPrice = Number(formData.unitPrice || 0);
    if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
      return 0;
    }
    return quantity * unitPrice;
  }, [formData.quantity, formData.unitPrice]);

  const toggleSupplierExpand = (supplierKey: string) => {
    setExpandedSupplierKeys((current) => {
      const next = new Set(current);
      if (next.has(supplierKey)) {
        next.delete(supplierKey);
      } else {
        next.add(supplierKey);
      }
      return next;
    });
  };

  const handlePurchasePdfExport = async (action: 'save' | 'share') => {
    if (!printablePurchase || !printablePurchaseRef.current) return;

    setIsExportingPdf(true);
    const filename = toSafePdfFileName(
      `进货单_${printablePurchase.supplierGroup.supplierName}_${printablePurchase.generatedAt}`,
    );

    try {
      const file = await createPdfFileFromElement(printablePurchaseRef.current, {
        filename,
        orientation: 'landscape',
        marginMm: 12,
      });

      if (action === 'save') {
        downloadPdfFile(file);
        setExportSupplierKey(null);
        return;
      }

      const result = await sharePdfFile(file, {
        title: filename.replace(/\.pdf$/i, ''),
        text: `${printablePurchase.supplierGroup.supplierName}的进货单`,
      });

      if (result === 'downloaded') {
        window.alert('当前浏览器无法直接分享到微信，已保存 PDF，可发送到微信。');
      }
      if (result !== 'cancelled') {
        setExportSupplierKey(null);
      }
    } catch {
      window.alert('PDF 生成失败，请稍后重试。');
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <Layout>
      <style>{`
        .purchase-print-layout {
          display: none;
        }

        @media print {
          @page {
            size: A4 landscape;
            margin: 12mm;
          }

          body {
            background: #ffffff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          aside,
          .purchase-screen-controls,
          .purchase-screen-layout,
          .purchase-modal-root {
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

          .purchase-page {
            padding: 0 !important;
          }

          .purchase-print-layout {
            display: block !important;
            width: 100% !important;
            padding: 0 !important;
            overflow: visible !important;
            box-sizing: border-box;
          }

          .purchase-print-card,
          .purchase-print-shell,
          .purchase-print-table-shell {
            width: 100% !important;
            max-width: none !important;
            overflow: visible !important;
            box-sizing: border-box;
          }

          .purchase-print-table {
            width: 100% !important;
            min-width: 0 !important;
            table-layout: fixed;
            font-size: 11px !important;
            box-sizing: border-box;
          }

          .purchase-print-table thead {
            display: table-header-group;
          }

          .purchase-print-table tr,
          .purchase-print-table td,
          .purchase-print-table th {
            page-break-inside: avoid;
            break-inside: avoid;
            box-sizing: border-box;
            overflow-wrap: anywhere;
            word-break: break-word;
          }
        }
      `}</style>

      <PageHeader
        title="进货管理"
        subtitle="按供应商、日期和材料逐层查看采购记录"
        action={{ label: '新增进货记录', onClick: openCreateModal }}
      />

      <div className="purchase-page p-8">
        <QueryStateBanner
          isLoading={isLoading}
          isError={Boolean(error)}
          loadingText="正在同步采购记录..."
          errorText="采购记录暂时无法同步，请确认后端服务已启动。"
          onRetry={() => refetch()}
        />
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="purchase-screen-controls border-b border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">开始日期</label>
                <DateField
                  value={filterDateRange.startDate}
                  onChange={(value) => setFilterDateRange({ ...filterDateRange, startDate: value })}
                  className="w-40"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">结束日期</label>
                <DateField
                  value={filterDateRange.endDate}
                  onChange={(value) => setFilterDateRange({ ...filterDateRange, endDate: value })}
                  className="w-40"
                />
              </div>

              <div className="flex gap-2 pb-0.5">
                <button
                  onClick={() => handleDateShortcut('month')}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                >
                  本月
                </button>
                <button
                  onClick={() => handleDateShortcut('year')}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                >
                  今年
                </button>
                <button
                  onClick={() => handleDateShortcut('all')}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                >
                  全部
                </button>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">供应商</label>
                <select
                  value={filterSupplierId}
                  onChange={(event) => setFilterSupplierId(event.target.value)}
                  className="block w-44 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">所有供应商</option>
                  {customers?.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">品名</label>
                <input
                  type="text"
                  value={filterItem}
                  onChange={(event) => setFilterItem(event.target.value)}
                  placeholder="输入品名搜索"
                  className="block w-44 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="ml-auto flex gap-2 pb-0.5">
                {(filterSupplierId || filterDateRange.startDate || filterDateRange.endDate || filterItem) && (
                  <button
                    onClick={() => {
                      setFilterSupplierId('');
                      setFilterDateRange({ startDate: '', endDate: '' });
                      setFilterItem('');
                    }}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-amber-700 transition-colors hover:bg-amber-50"
                  >
                    清除筛选
                  </button>
                )}

              </div>
            </div>
          </div>

          <div className="purchase-screen-layout p-6">
            {groupedPurchases.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-20 text-center">
                <p className="text-base font-medium text-gray-700">暂无符合条件的采购记录</p>
                <p className="mt-2 text-sm text-gray-500">调整筛选条件，或先创建新的采购记录。</p>
              </div>
            ) : (
              <div className="space-y-4">
                {groupedPurchases.map((supplierGroup) => {
                  const isSupplierExpanded = expandedSupplierKeys.has(supplierGroup.supplierKey);

                  return (
                    <section key={supplierGroup.supplierKey} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                      <button
                        type="button"
                        onClick={() => toggleSupplierExpand(supplierGroup.supplierKey)}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="text-gray-400">
                            {isSupplierExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-lg font-semibold text-gray-900">{supplierGroup.supplierName}</h3>
                            {!supplierGroup.supplierId && (
                              <p className="mt-1 text-xs text-amber-600">历史记录尚未关联供应商，编辑后即可纳入供应商对账。</p>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-6 text-right">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-gray-400">采购条数</p>
                            <p className="mt-1 text-lg font-semibold text-gray-900">{supplierGroup.purchaseCount}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-gray-400">总金额</p>
                            <p className="mt-1 text-lg font-semibold text-gray-900">¥{formatAmount(supplierGroup.totalAmount)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={(event) => handleOpenSupplierExport(supplierGroup.supplierKey, event)}
                            className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                            title="导出 PDF"
                          >
                            <Download className="mr-1 h-4 w-4" />
                            导出
                          </button>
                        </div>
                      </button>

                      {isSupplierExpanded && (
                        <div className="border-t border-gray-200 bg-gray-50/70 p-4">
                          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">日期</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">品名</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">数量</th>
                                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">单位</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">单价</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">总金额</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">备注</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">操作</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                  {supplierGroup.purchases.map((purchase) => (
                                    <tr key={purchase.id} className="hover:bg-gray-50">
                                      <td className="px-3 py-2 text-sm text-gray-500">{purchase.purchaseDate}</td>
                                      <td className="px-3 py-2 text-sm text-gray-900">{purchase.item}</td>
                                      <td className="px-3 py-2 text-right text-sm text-gray-900">
                                        {formatDisplayDecimal(purchase.quantity, 4)}
                                      </td>
                                      <td className="px-3 py-2 text-center text-sm text-gray-500">{purchase.unit || '-'}</td>
                                      <td className="px-3 py-2 text-right text-sm text-gray-900">
                                        {formatUnitPrice(purchase.unitPrice)}
                                      </td>
                                      <td className="px-3 py-2 text-right text-sm font-medium text-gray-900">
                                        ¥{formatAmount(getPurchaseAmount(purchase))}
                                      </td>
                                      <td className="px-3 py-2 text-sm text-gray-500">{purchase.remark || '-'}</td>
                                      <td className="px-3 py-2 text-right">
                                        <div className="flex justify-end gap-2">
                                          <button
                                            type="button"
                                            onClick={() => handleEditPurchase(purchase)}
                                            className="rounded-md border border-gray-300 p-2 text-emerald-700 transition-colors hover:bg-emerald-50"
                                            title="编辑"
                                          >
                                            <Edit className="h-4 w-4" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleDeletePurchase(purchase)}
                                            className="rounded-md border border-gray-300 p-2 text-red-600 transition-colors hover:bg-red-50"
                                            title="删除"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>

          {printablePurchase && (
            <ExportActionDialog
              title="导出进货单"
              description={`为 ${printablePurchase.supplierGroup.supplierName} 保存 PDF，或在手机端分享到微信。`}
              isProcessing={isExportingPdf}
              onSave={() => handlePurchasePdfExport('save')}
              onShare={() => handlePurchasePdfExport('share')}
              onClose={() => setExportSupplierKey(null)}
            />
          )}

          {printablePurchase && (
          <div ref={printablePurchaseRef} className="purchase-print-layout">
            <div className="purchase-print-card purchase-print-shell bg-white text-gray-900">
              <div className="flex items-end justify-between border-b border-gray-900 pb-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-gray-500">Kinko Purchase Report</p>
                  <h2 className="mt-2 text-[22px] font-semibold text-gray-900">进货记录导出</h2>
                  <p className="mt-2 text-[12px] text-gray-700">
                    供应商: {printablePurchase.supplierGroup.supplierName}
                  </p>
                </div>
                <div className="text-right text-[12px] text-gray-700">
                  <p>生成时间: {printablePurchase.generatedAt}</p>
                  <p>采购条数: {printablePurchase.supplierGroup.purchaseCount} 条</p>
                  <p>总金额: ¥{formatAmount(printablePurchase.supplierGroup.totalAmount)}</p>
                </div>
              </div>

              <div className="purchase-print-table-shell pt-4">
                <table className="purchase-print-table w-full border-collapse">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">日期</th>
                      <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">品名</th>
                      <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">数量</th>
                      <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">单位</th>
                      <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">单价</th>
                      <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">总金额</th>
                      <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">备注</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printablePurchase.supplierGroup.purchases.map((purchase) => (
                      <tr key={purchase.id}>
                        <td className="border border-gray-900 px-2 py-3 text-center text-sm text-gray-900">
                          {purchase.purchaseDate}
                        </td>
                        <td className="border border-gray-900 px-3 py-3 text-sm text-gray-900">{purchase.item}</td>
                        <td className="border border-gray-900 px-2 py-3 text-right text-sm text-gray-900">
                          {formatDisplayDecimal(purchase.quantity, 4)}
                        </td>
                        <td className="border border-gray-900 px-2 py-3 text-center text-sm text-gray-700">
                          {purchase.unit || '-'}
                        </td>
                        <td className="border border-gray-900 px-2 py-3 text-right text-sm text-gray-900">
                          {formatUnitPrice(purchase.unitPrice)}
                        </td>
                        <td className="border border-gray-900 px-2 py-3 text-right text-sm font-medium text-gray-900">
                          ¥{formatAmount(getPurchaseAmount(purchase))}
                        </td>
                        <td className="border border-gray-900 px-2 py-3 text-sm text-gray-700">
                          {purchase.remark || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="purchase-modal-root fixed inset-0 h-full w-full overflow-y-auto bg-gray-600 bg-opacity-50">
          <div className="relative top-20 mx-auto w-full max-w-2xl rounded-md border bg-white p-5 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">{isEditing ? '编辑采购记录' : '新增采购记录'}</h3>
              <button onClick={resetForm} className="text-gray-400 transition-colors hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">日期</label>
                  <DateField
                    value={formData.purchaseDate}
                    onChange={(value) => setFormData({ ...formData, purchaseDate: value })}
                    className="mt-1 w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">供应商</label>
                  <select
                    value={formData.supplierId}
                    onChange={(event) => setFormData({ ...formData, supplierId: event.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                  >
                    <option value="">选择供应商</option>
                    {customers?.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">品名</label>
                <input
                  type="text"
                  value={formData.item}
                  onChange={(event) => setFormData({ ...formData, item: event.target.value })}
                  placeholder="例如：铜线、螺丝、塑料粒子"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">数量</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.quantity}
                    onChange={(event) => setFormData({ ...formData, quantity: event.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">单位</label>
                  <input
                    type="text"
                    value={formData.unit}
                    onChange={(event) => setFormData({ ...formData, unit: event.target.value })}
                    placeholder="个 / kg / 卷"
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">单价</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.unitPrice}
                    onChange={(event) => setFormData({ ...formData, unitPrice: event.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.18em] text-blue-600">自动计算</div>
                <div className="mt-2 text-lg font-semibold text-gray-900">总金额：¥{formatAmount(computedAmount)}</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">备注</label>
                <textarea
                  value={formData.remark}
                  onChange={(event) => setFormData({ ...formData, remark: event.target.value })}
                  rows={3}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={resetForm}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleCreateOrUpdate}
                className="rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                {isEditing ? '保存采购记录' : '创建采购记录'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Purchase;
