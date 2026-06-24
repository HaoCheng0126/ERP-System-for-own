import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, Trash2, X } from 'lucide-react';
import DateField from '../components/DateField';
import ExportActionDialog from '../components/ExportActionDialog';
import FilterPanel, { ActiveFilter, DateShortcutGroup, FilterField, SearchInput } from '../components/FilterPanel';
import Layout from '../components/Layout';
import { MobileActionBar, MobileField, MobileFieldGrid, MobileRecordCard } from '../components/MobileRecordCard';
import PageHeader from '../components/PageHeader';
import QueryStateBanner from '../components/QueryStateBanner';
import ProductAutocomplete from '../components/ProductAutocomplete';
import QuickCreateProductForm, { QuickCreateProductDraft } from '../components/QuickCreateProductForm';
import { CustomerType, Product, PurchaseOrder } from '../types';
import { formatAmount, formatAmountDetail, formatDisplayDecimal, formatEditableDecimal, formatUnitPrice } from '../utils/format';
import { getPurchaseAmount, groupPurchases } from '../utils/purchaseGrouping';
import { DateRangeShortcut, getDateRangeByShortcut, matchesKeyword } from '../utils/filtering';
import useDebouncedValue from '../hooks/useDebouncedValue';
import { useCounterparties } from '../hooks/useCounterparties';
import api from '../utils/api';
import { exportPrintable, getShareFallbackMessage, toSafePdfFileName } from '../utils/printShare';
import DisclosureSection from '../components/records/DisclosureSection';
import DateSectionHeader from '../components/records/DateSectionHeader';
import EntityCardHeader from '../components/records/EntityCardHeader';

type PurchaseFormState = {
  purchaseDate: string;
  supplierId: string;
  productId: string;
  item: string;
  quantity: string | number;
  unit: string;
  unitPrice: string | number;
  remark: string;
  newProduct?: QuickCreateProductDraft | null;
};

const createEmptyPurchaseForm = (): PurchaseFormState => ({
  purchaseDate: new Date().toISOString().split('T')[0],
  supplierId: '',
  productId: '',
  item: '',
  quantity: '',
  unit: '个',
  unitPrice: '',
  remark: '',
  newProduct: null,
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
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateName, setQuickCreateName] = useState('');
  const debouncedFilterItem = useDebouncedValue(filterItem);

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

  const { data: customers } = useCounterparties(CustomerType.SUPPLIER);

  const { data: purchases, isLoading, error, refetch } = useQuery({
    queryKey: ['purchases'],
    queryFn: async () => {
      const response = await api.get('/purchases');
      return response.data as PurchaseOrder[];
    },
  });

  const { data: rawMaterials } = useQuery({
    queryKey: ['products', 'raw_material'],
    queryFn: async () => {
      const response = await api.get('/products?type=raw_material');
      return response.data as Product[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: PurchaseFormState) => {
      const response = await api.post('/purchases', {
        purchaseDate: data.purchaseDate,
        supplierId: data.supplierId,
        productId: data.productId,
        item: data.item,
        quantity: Number(data.quantity),
        unit: data.unit,
        unitPrice: Number(data.unitPrice),
        remark: data.remark,
        ...(data.newProduct
          ? {
              newProduct: {
                name: data.newProduct.name,
                specification: data.newProduct.specification,
                unit: data.newProduct.unit,
                costPrice: Number(data.unitPrice) || 0,
              },
            }
          : {}),
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['salesStats'] });
      queryClient.invalidateQueries({ queryKey: ['customerStats'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: PurchaseFormState }) => {
      const response = await api.put(`/purchases/${id}`, {
        purchaseDate: data.purchaseDate,
        supplierId: data.supplierId,
        productId: data.productId,
        item: data.item,
        quantity: Number(data.quantity),
        unit: data.unit,
        unitPrice: Number(data.unitPrice),
        remark: data.remark,
        ...(data.newProduct
          ? {
              newProduct: {
                name: data.newProduct.name,
                specification: data.newProduct.specification,
                unit: data.newProduct.unit,
                costPrice: Number(data.unitPrice) || 0,
              },
            }
          : {}),
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['salesStats'] });
      queryClient.invalidateQueries({ queryKey: ['customerStats'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/purchases/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['salesStats'] });
      queryClient.invalidateQueries({ queryKey: ['customerStats'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
    },
  });

  const handleEditPurchase = (purchase: PurchaseOrder) => {
    setFormData({
      purchaseDate: purchase.purchaseDate,
      supplierId: purchase.supplierId || purchase.supplierEntity?.id || '',
      productId: purchase.productId || purchase.product?.id || '',
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

  const handleProductSelect = (productId: string) => {
    const product = (rawMaterials || []).find((item) => item.id === productId);
    setFormData((current) => ({
      ...current,
      productId,
      newProduct: null,
      item: product ? `${product.name}${product.specification ? ` ${product.specification}` : ''}` : current.item,
      unit: product?.unit || current.unit,
      unitPrice: product ? formatEditableDecimal(product.costPrice || 0) : current.unitPrice,
    }));
  };

  const openQuickCreate = (name: string) => {
    setQuickCreateName(name);
    setQuickCreateOpen(true);
  };

  const confirmQuickCreate = (draft: QuickCreateProductDraft) => {
    setFormData((current) => ({
      ...current,
      productId: '',
      newProduct: draft,
      item: `${draft.name}${draft.specification ? ` ${draft.specification}` : ''}`,
      unit: draft.unit || current.unit,
      unitPrice: draft.price ? formatEditableDecimal(draft.price) : current.unitPrice,
    }));
    setQuickCreateOpen(false);
  };

  const clearNewProduct = () => {
    setFormData((current) => ({ ...current, newProduct: null, item: '' }));
  };

  const handleOpenSupplierExport = (supplierKey: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setExportSupplierKey(supplierKey);
  };

  const handleDateShortcut = (shortcut: DateRangeShortcut) => {
    setFilterDateRange(getDateRangeByShortcut(shortcut));
  };

  const clearFilters = () => {
    setFilterSupplierId('');
    setFilterDateRange({ startDate: '', endDate: '' });
    setFilterItem('');
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
      purchaseFilter: (purchase) => matchesKeyword(debouncedFilterItem, [
        purchase.item,
        purchase.remark,
        purchase.unit,
        purchase.product?.name,
        purchase.product?.specification,
        purchase.supplierEntity?.name,
        purchase.supplier,
      ]),
    });
  }, [baseFilteredPurchases, debouncedFilterItem]);
  const filteredPurchaseCount = useMemo(
    () => groupedPurchases.reduce((sum, group) => sum + group.purchaseCount, 0),
    [groupedPurchases],
  );

  const activeFilters: ActiveFilter[] = [
    filterDateRange.startDate || filterDateRange.endDate
      ? {
          key: 'date',
          label: `日期: ${filterDateRange.startDate || '不限'} 至 ${filterDateRange.endDate || '不限'}`,
          onRemove: () => setFilterDateRange({ startDate: '', endDate: '' }),
        }
      : null,
    filterSupplierId
      ? {
          key: 'supplier',
          label: `供应商: ${customers?.find((supplier) => supplier.id === filterSupplierId)?.name || filterSupplierId}`,
          onRemove: () => setFilterSupplierId(''),
        }
      : null,
    filterItem
      ? {
          key: 'keyword',
          label: `关键词: ${filterItem}`,
          onRemove: () => setFilterItem(''),
        }
      : null,
  ].filter((item): item is ActiveFilter => Boolean(item));

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
      const result = await exportPrintable(
        printablePurchaseRef.current,
        {
          filename,
          orientation: 'landscape',
          marginMm: 12,
          title: filename.replace(/\.pdf$/i, ''),
          text: `${printablePurchase.supplierGroup.supplierName}的进货单`,
        },
        action,
      );

      if (result === 'fallback-download') {
        window.alert(getShareFallbackMessage());
      }
      if (result !== 'cancelled') {
        setExportSupplierKey(null);
      }
    } catch {
      window.alert('导出失败，请稍后重试。');
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

      <div className="purchase-page px-4 pb-4 pt-0 md:px-6 md:pb-6">
        <QueryStateBanner
          isLoading={isLoading}
          isError={Boolean(error)}
          loadingText="正在同步采购记录..."
          errorText="采购记录暂时无法同步，请确认后端服务已启动。"
          onRetry={() => refetch()}
        />
        <div className="-mx-4 overflow-hidden border-b border-line bg-white md:-mx-6">
          <div className="purchase-screen-controls">
            <FilterPanel
              totalCount={(purchases || []).length}
              filteredCount={filteredPurchaseCount}
              activeFilters={activeFilters}
              onClear={clearFilters}
              primary={
                <>
                  <FilterField label="关键词" className="lg:w-64">
                    <SearchInput
                      value={filterItem}
                      onChange={setFilterItem}
                      placeholder="品名、规格、供应商、备注"
                    />
                  </FilterField>
                  <FilterField label="开始日期" className="lg:w-40">
                    <DateField
                      value={filterDateRange.startDate}
                      onChange={(value) => setFilterDateRange({ ...filterDateRange, startDate: value })}
                      className="w-full"
                    />
                  </FilterField>
                  <FilterField label="结束日期" className="lg:w-40">
                    <DateField
                      value={filterDateRange.endDate}
                      onChange={(value) => setFilterDateRange({ ...filterDateRange, endDate: value })}
                      className="w-full"
                    />
                  </FilterField>
                  <FilterField label="快捷日期" className="sm:col-span-2 lg:w-72">
                    <DateShortcutGroup onSelect={handleDateShortcut} />
                  </FilterField>
                </>
              }
              advanced={
                <FilterField label="供应商" className="lg:w-44">
                  <select
                    value={filterSupplierId}
                    onChange={(event) => setFilterSupplierId(event.target.value)}
                    className="block min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">所有供应商</option>
                    {customers?.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </FilterField>
              }
            />
          </div>

          <div className="purchase-screen-layout bg-canvas p-4 md:p-6">
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
                    <section
                      key={supplierGroup.supplierKey}
                      className="overflow-hidden rounded-2xl border border-line bg-white shadow-card"
                    >
                      <EntityCardHeader
                        name={supplierGroup.supplierName}
                        initial={supplierGroup.supplierName.slice(0, 1) || '供'}
                        stats={[
                          { label: '采购条数', value: String(supplierGroup.purchaseCount) },
                          { label: '总金额', value: `¥${formatAmount(supplierGroup.totalAmount)}` },
                        ]}
                        note={
                          !supplierGroup.supplierId
                            ? '历史记录尚未关联供应商，编辑后即可纳入供应商对账。'
                            : undefined
                        }
                        expanded={isSupplierExpanded}
                        onToggle={() => toggleSupplierExpand(supplierGroup.supplierKey)}
                        onExport={(event) => handleOpenSupplierExport(supplierGroup.supplierKey, event)}
                      />

                      <DisclosureSection open={isSupplierExpanded}>
                        <div className="space-y-5 border-t border-line bg-canvas px-3 py-4 sm:px-4">
                          {supplierGroup.dates.map((dateGroup) => (
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
                                        <th className="px-4 py-2.5 text-right text-xs font-medium">数量</th>
                                        <th className="px-4 py-2.5 text-center text-xs font-medium">单位</th>
                                        <th className="px-4 py-2.5 text-right text-xs font-medium">单价</th>
                                        <th className="px-4 py-2.5 text-right text-xs font-medium">总金额</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-medium">备注</th>
                                        <th className="px-4 py-2.5 text-right text-xs font-medium">操作</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-line-soft">
                                      {dateGroup.purchases.map((purchase) => (
                                        <tr key={purchase.id} className="transition-colors hover:bg-brand-50/40">
                                          <td className="px-4 py-2.5 text-sm text-ink">{purchase.item}</td>
                                          <td className="px-4 py-2.5 text-right text-sm tabular-nums text-ink">
                                            {formatDisplayDecimal(purchase.quantity, 4)}
                                          </td>
                                          <td className="px-4 py-2.5 text-center text-sm text-ink-secondary">{purchase.unit || '-'}</td>
                                          <td className="px-4 py-2.5 text-right text-sm tabular-nums text-ink">
                                            {formatUnitPrice(purchase.unitPrice)}
                                          </td>
                                          <td className="px-4 py-2.5 text-right text-sm font-medium tabular-nums text-ink">
                                            ¥{formatAmountDetail(getPurchaseAmount(purchase))}
                                          </td>
                                          <td className="px-4 py-2.5 text-sm text-ink-secondary">{purchase.remark || '-'}</td>
                                          <td className="px-4 py-2.5 text-right">
                                            <div className="flex justify-end gap-2">
                                              <button
                                                type="button"
                                                onClick={() => handleEditPurchase(purchase)}
                                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-emerald-600 transition-colors hover:bg-emerald-50"
                                                title="编辑"
                                              >
                                                <Edit className="h-4 w-4" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => handleDeletePurchase(purchase)}
                                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-rose-500 transition-colors hover:bg-rose-50"
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
                                <div className="space-y-3 p-3 md:hidden">
                                  {dateGroup.purchases.map((purchase) => (
                                    <MobileRecordCard key={purchase.id} className="border-line-soft shadow-none">
                                      <div className="mb-3 flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="text-sm font-semibold text-ink">{purchase.item}</div>
                                        </div>
                                        <div className="shrink-0 text-right">
                                          <div className="text-xs text-ink-tertiary">金额</div>
                                          <div className="text-base font-bold tabular-nums text-ink">
                                            ¥{formatAmountDetail(getPurchaseAmount(purchase))}
                                          </div>
                                        </div>
                                      </div>
                                      <MobileFieldGrid>
                                        <MobileField label="数量" value={`${formatDisplayDecimal(purchase.quantity, 4)} ${purchase.unit || ''}`} />
                                        <MobileField label="单价" value={formatUnitPrice(purchase.unitPrice)} align="right" />
                                        <MobileField label="备注" value={purchase.remark || '-'} />
                                      </MobileFieldGrid>
                                      <MobileActionBar>
                                        <button
                                          type="button"
                                          onClick={() => handleEditPurchase(purchase)}
                                          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-100 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                                        >
                                          <Edit className="h-4 w-4" />
                                          编辑
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeletePurchase(purchase)}
                                          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-100 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                          删除
                                        </button>
                                      </MobileActionBar>
                                    </MobileRecordCard>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </DisclosureSection>
                    </section>
                  );
                })}
              </div>
            )}
          </div>

          {printablePurchase && (
            <ExportActionDialog
              title="导出进货单"
              description={`为 ${printablePurchase.supplierGroup.supplierName} 生成 PDF 文件，可保存，或打开系统分享面板后选择微信。`}
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
                          ¥{formatAmountDetail(getPurchaseAmount(purchase))}
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
        <div className="purchase-modal-root fixed inset-0 z-50 flex items-end justify-center bg-gray-600 bg-opacity-50 sm:items-center">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border bg-white p-5 shadow-lg sm:max-w-2xl sm:rounded-lg">
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
                <label className="block text-sm font-medium text-gray-700">原材料（品名 / 规格）</label>
                {formData.newProduct ? (
                  <div className="mt-1 flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-emerald-700">
                        新建：{formData.newProduct.name}
                        {formData.newProduct.specification ? ` - ${formData.newProduct.specification}` : ''}
                      </div>
                      <div className="mt-0.5 text-xs text-emerald-600">将随本单一起保存到产品管理（原材料）</div>
                    </div>
                    <button
                      type="button"
                      onClick={clearNewProduct}
                      className="shrink-0 rounded-md p-1 text-emerald-600 transition-colors hover:bg-emerald-100"
                      title="移除"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <ProductAutocomplete
                      products={rawMaterials || []}
                      value={formData.productId}
                      onSelect={handleProductSelect}
                      allowCreate
                      onCreateNew={openQuickCreate}
                      placeholder="输入原材料名称或规格"
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                    />
                    <p className="mt-1 text-xs text-gray-500">选择已有原材料，或直接新建——新建会自动保存到产品管理。</p>
                  </>
                )}
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

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={resetForm}
                className="min-h-11 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleCreateOrUpdate}
                disabled={!isEditing && !formData.productId && !formData.newProduct}
                className="min-h-11 rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isEditing ? '保存采购记录' : '创建采购记录'}
              </button>
            </div>
          </div>
        </div>
      )}

      {quickCreateOpen && (
        <QuickCreateProductForm
          initialName={quickCreateName}
          priceLabel="进货单价"
          onCancel={() => setQuickCreateOpen(false)}
          onConfirm={confirmQuickCreate}
        />
      )}
    </Layout>
  );
};

export default Purchase;
