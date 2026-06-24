import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, FileText, Edit, Plus, CheckSquare, Square, Download, Trash2 } from 'lucide-react';
import DateField from '../components/DateField';
import ExportActionDialog from '../components/ExportActionDialog';
import FilterPanel, { ActiveFilter, DateShortcutGroup, FilterField } from '../components/FilterPanel';
import Layout from '../components/Layout';
import { MobileActionBar, MobileField, MobileFieldGrid, MobileRecordCard } from '../components/MobileRecordCard';
import PageHeader from '../components/PageHeader';
import ProductAutocomplete from '../components/ProductAutocomplete';
import ActionableEmptyState from '../components/ActionableEmptyState';
import QueryStateBanner from '../components/QueryStateBanner';
import api from '../utils/api';
import { formatAmount, formatAmountDetail, formatUnitPrice } from '../utils/format';
import { DateRangeShortcut, getDateRangeByShortcut } from '../utils/filtering';
import {
  InventoryRecord,
  InventoryRecordStatus,
  InventoryRecordSubmissionMode,
  Product,
  User,
  UserRole,
} from '../types';
import { getUserRole } from '../utils/auth';
import { exportPrintable, getShareFallbackMessage, toSafePdfFileName } from '../utils/printShare';
import QuickCreateProductForm, { QuickCreateProductDraft } from '../components/QuickCreateProductForm';

type NewInventoryRecordDraft = {
  productName: string;
  productId: string;
  quantity: string | number;
  newProduct?: { name: string; specification: string; unit: string; costPrice: number };
  costPriceOverride?: string | number;
};

const Inventory: React.FC = () => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<InventoryRecord | null>(null);
  const [newRecords, setNewRecords] = useState<NewInventoryRecordDraft[]>([
    { productName: '', productId: '', quantity: '' }
  ]);
  const [quickCreateIndex, setQuickCreateIndex] = useState<number | null>(null);
  const [quickCreateName, setQuickCreateName] = useState('');
  const [editingRecord, setEditingRecord] = useState<{
    id: string;
    productId: string;
    quantity: string | number;
    submittedBy: string;
    remark: string;
  }>({
    id: '',
    productId: '',
    quantity: '',
    submittedBy: '',
    remark: '',
  });
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');
  const [errorModalTitle, setErrorModalTitle] = useState('提交失败');
  const inventoryExportRef = useRef<HTMLDivElement>(null);
  const [currentUser] = useState(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  });
  const [selectedSubmitterId, setSelectedSubmitterId] = useState<string>(currentUser?.id || '');
  const [reviewData, setReviewData] = useState<{ status: InventoryRecordStatus; quantity: string | number; remark: string }>({
    status: InventoryRecordStatus.APPROVED,
    quantity: '',
    remark: '',
  });

  const openAddModal = () => {
    setSelectedSubmitterId(currentUser?.id || '');
    setNewRecords([{ productName: '', productId: '', quantity: '' }]);
    setShowAddModal(true);
  };

  // 筛选状态
  const [filterProduct, setFilterProduct] = useState('');
  const [filterSpec, setFilterSpec] = useState('');
  const [filterSubmitter, setFilterSubmitter] = useState('');
  const [filterDateRange, setFilterDateRange] = useState({
    startDate: '',
    endDate: '',
  });
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const queryClient = useQueryClient();
  const userRole = getUserRole();
  const isAdmin = userRole === UserRole.ADMIN;
  const currentSubmissionMode = isAdmin
    ? InventoryRecordSubmissionMode.ADMIN_ASSIGN
    : InventoryRecordSubmissionMode.EMPLOYEE_SUBMIT;

  // 获取入库单列表
  const { data: inventoryRecords, isLoading, error, refetch } = useQuery({
    queryKey: ['inventoryRecords'],
    queryFn: async () => {
      const response = await api.get('/inventory');
      return response.data;
    },
  });

  // 过滤记录（用 useMemo 包裹，避免任意无关状态变更都重算；数据量大时尤为重要）
  const filteredRecords = useMemo(() => ((inventoryRecords || []) as InventoryRecord[]).filter((record: InventoryRecord) => {
    const matchProduct = filterProduct ? record.product?.name === filterProduct : true;
    const matchSpec = filterSpec ? record.product?.specification === filterSpec : true;
    
    const submitterName = record.submitter?.name || '';
    const matchSubmitter = submitterName.toLowerCase().includes(filterSubmitter.toLowerCase());
    
    const recordDate = new Date(record.createdAt).toISOString().split('T')[0];
    const matchDate =
      (filterDateRange.startDate ? recordDate >= filterDateRange.startDate : true) &&
      (filterDateRange.endDate ? recordDate <= filterDateRange.endDate : true);

    let matchStatus = true;
    if (filterStatus !== 'all') {
      matchStatus = record.status === filterStatus;
    }

    return matchProduct && matchSpec && matchSubmitter && matchDate && matchStatus;
  }), [
    inventoryRecords,
    filterProduct,
    filterSpec,
    filterSubmitter,
    filterDateRange.startDate,
    filterDateRange.endDate,
    filterStatus,
  ]);
  const selectableFilteredRecords = filteredRecords.filter(
    (record: InventoryRecord) => record.status === InventoryRecordStatus.PENDING
  );
  const areAllSelectableRecordsSelected =
    selectableFilteredRecords.length > 0 &&
    selectableFilteredRecords.every((record: InventoryRecord) => selectedRecordIds.has(record.id));

  // 获取产品列表 (用于筛选)
  const { data: products } = useQuery({
    queryKey: ['products', 'finished'],
    queryFn: async () => {
      const response = await api.get('/products?type=finished');
      return response.data;
    },
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await api.get('/users');
      return response.data;
    },
    enabled: isAdmin,
  });
  const activeAssignableUsers = (users || []).filter((user) => user.isActive);
  const productList = (products || []) as Product[];
  const getProductById = (productId: string) =>
    productList.find((product) => product.id === productId);
  const productNames = Array.from(new Set(productList.map((product) => product.name))).sort((left, right) =>
    left.localeCompare(right, 'zh-CN'),
  );
  const submitterNames = Array.from(
    new Set<string>(
      (inventoryRecords || [])
        .map((record: InventoryRecord) => record.submitter?.name)
        .filter((name: string | undefined): name is string => Boolean(name)),
    ),
  ).sort((left, right) => left.localeCompare(right, 'zh-CN'));
  const filterSpecOptions = Array.from(
    new Set(
      productList
        .filter((product) => !filterProduct || product.name === filterProduct)
        .map((product) => product.specification),
    ),
  ).sort((left, right) => left.localeCompare(right, 'zh-CN'));
  const getStatusFilterText = (status: string) => {
    switch (status) {
      case InventoryRecordStatus.PENDING:
        return '待审核';
      case InventoryRecordStatus.APPROVED:
        return '已通过';
      case InventoryRecordStatus.REJECTED:
        return '已拒绝';
      default:
        return '所有状态';
    }
  };

  const clearFilters = () => {
    setFilterProduct('');
    setFilterSpec('');
    setFilterSubmitter('');
    setFilterDateRange({ startDate: '', endDate: '' });
    setFilterStatus('all');
  };

  const handleDateShortcut = (shortcut: DateRangeShortcut) => {
    setFilterDateRange(getDateRangeByShortcut(shortcut));
  };

  const activeFilters: ActiveFilter[] = [
    filterDateRange.startDate || filterDateRange.endDate
      ? {
          key: 'date',
          label: `日期: ${filterDateRange.startDate || '不限'} 至 ${filterDateRange.endDate || '不限'}`,
          onRemove: () => setFilterDateRange({ startDate: '', endDate: '' }),
        }
      : null,
    filterProduct
      ? {
          key: 'product',
          label: `产品: ${filterProduct}`,
          onRemove: () => {
            setFilterProduct('');
            setFilterSpec('');
          },
        }
      : null,
    filterSpec
      ? {
          key: 'spec',
          label: `规格: ${filterSpec}`,
          onRemove: () => setFilterSpec(''),
        }
      : null,
    filterSubmitter
      ? {
          key: 'submitter',
          label: `提交人: ${filterSubmitter}`,
          onRemove: () => setFilterSubmitter(''),
        }
      : null,
    filterStatus !== 'all'
      ? {
          key: 'status',
          label: `状态: ${getStatusFilterText(filterStatus)}`,
          onRemove: () => setFilterStatus('all'),
        }
      : null,
  ].filter((item): item is ActiveFilter => Boolean(item));

  // 创建入库单
  const createInventoryMutation = useMutation({
    mutationFn: async (payload: {
      records: {
        productId?: string;
        quantity: number;
        newProduct?: { name: string; specification: string; unit: string; costPrice: number };
        costPriceOverride?: number;
      }[];
      submittedBy?: string;
      submissionMode: InventoryRecordSubmissionMode;
    }) => {
      const response = await api.post('/inventory', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventoryRecords'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryStats'] });
      queryClient.invalidateQueries({ queryKey: ['salaryReport'] });
      setShowAddModal(false);
      setNewRecords([{ productName: '', productId: '', quantity: '' }]);
      setSelectedSubmitterId(currentUser?.id || '');
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        '提交入库单失败，请稍后重试';
      setErrorModalTitle('提交失败');
      setErrorModalMessage(message);
    },
  });

  // 更新入库单 (重新提交)
  const updateInventoryMutation = useMutation({
    mutationFn: async (record: typeof editingRecord) => {
      const response = await api.put(`/inventory/${record.id}`, {
        productId: record.productId,
        quantity: Number(record.quantity),
        submittedBy: record.submittedBy,
        remark: record.remark,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventoryRecords'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryStats'] });
      queryClient.invalidateQueries({ queryKey: ['salaryReport'] });
      setShowEditModal(false);
      setEditingRecord({
        id: '',
        productId: '',
        quantity: '',
        submittedBy: '',
        remark: '',
      });
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        '修改失败，请稍后重试';
      setErrorModalTitle('修改失败');
      setErrorModalMessage(message);
    },
  });

  // 审核入库单
  const reviewInventoryMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & typeof reviewData) => {
      const response = await api.put(`/inventory/${id}/review`, {
        ...data,
        quantity: Number(data.quantity)
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventoryRecords'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryStats'] });
      queryClient.invalidateQueries({ queryKey: ['salaryReport'] });
      setShowReviewModal(false);
      setSelectedRecord(null);
      setReviewData({
        status: InventoryRecordStatus.APPROVED,
        quantity: '',
        remark: '',
      });
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        '审核失败，请稍后重试';
      setErrorModalTitle('审核失败');
      setErrorModalMessage(message);
    },
  });

  const deleteInventoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/inventory/${id}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventoryRecords'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryStats'] });
      queryClient.invalidateQueries({ queryKey: ['salaryReport'] });
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        '删除失败，请稍后重试';
      setErrorModalTitle('删除失败');
      setErrorModalMessage(message);
    },
  });

  // 批量审核
  const batchReviewMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: InventoryRecordStatus }) => {
      const response = await api.put('/inventory/batch/review', {
        ids,
        status,
        remark: '批量审核',
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventoryRecords'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryStats'] });
      queryClient.invalidateQueries({ queryKey: ['salaryReport'] });
      setSelectedRecordIds(new Set());
      setIsBatchProcessing(false);
    },
    onError: (error: any) => {
      setIsBatchProcessing(false);
      const message =
        error?.response?.data?.message ||
        error?.message ||
        '批量处理过程中出现错误，请重试';
      setErrorModalTitle('批量审核失败');
      setErrorModalMessage(message);
    }
  });

  const handleAddInventory = () => {
    if (!products || products.length === 0) {
      alert('暂无产品，无法提交入库单，请先在产品管理中新增产品');
      return;
    }

    const validRecords = newRecords
      .map((r) => ({ ...r, quantity: Number(r.quantity) }))
      .filter((r) => (r.productId || r.newProduct) && r.quantity > 0)
      .map((r) => {
        const base: {
          productId?: string;
          quantity: number;
          newProduct?: { name: string; specification: string; unit: string; costPrice: number };
          costPriceOverride?: number;
        } = { quantity: r.quantity };
        if (r.newProduct) {
          base.newProduct = r.newProduct;
        } else {
          base.productId = r.productId;
          const selected = getProductById(r.productId);
          if (
            selected &&
            Number(selected.costPrice) === 0 &&
            r.costPriceOverride !== undefined &&
            r.costPriceOverride !== ''
          ) {
            base.costPriceOverride = Number(r.costPriceOverride);
          }
        }
        return base;
      });

    if (validRecords.length === 0) {
      alert('请至少选择一个产品并填写数量');
      return;
    }

    if (isAdmin) {
      const submitterId = selectedSubmitterId || currentUser?.id;
      if (!submitterId) {
        alert('请选择提交人');
        return;
      }
      createInventoryMutation.mutate({
        records: validRecords,
        submittedBy: submitterId,
        submissionMode: currentSubmissionMode,
      });
    } else {
      createInventoryMutation.mutate({
        records: validRecords,
        submissionMode: currentSubmissionMode,
      });
    }
  };

  const handleUpdateRecord = (
    index: number,
    field: 'productName' | 'productId' | 'quantity' | 'costPriceOverride',
    value: any,
  ) => {
    const updated = [...newRecords];
    if (field === 'productName') {
      updated[index] = { ...updated[index], productName: value, productId: '', costPriceOverride: undefined };
    } else if (field === 'productId') {
      const selectedProduct = getProductById(value);
      updated[index] = {
        ...updated[index],
        productId: value,
        productName: selectedProduct?.name || updated[index].productName,
        costPriceOverride: undefined,
      };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setNewRecords(updated);
  };

  const openQuickCreate = (index: number, name: string) => {
    setQuickCreateIndex(index);
    setQuickCreateName(name);
  };

  const confirmQuickCreate = (draft: QuickCreateProductDraft) => {
    if (quickCreateIndex === null) return;
    const index = quickCreateIndex;
    setNewRecords((current) => {
      const updated = [...current];
      if (!updated[index]) return current;
      updated[index] = {
        ...updated[index],
        productId: '',
        productName: `${draft.name} - ${draft.specification}`,
        costPriceOverride: undefined,
        newProduct: {
          name: draft.name,
          specification: draft.specification,
          unit: draft.unit,
          costPrice: draft.price,
        },
      };
      return updated;
    });
    setQuickCreateIndex(null);
    setQuickCreateName('');
  };

  const clearNewProduct = (index: number) => {
    setNewRecords((current) => {
      const updated = [...current];
      if (!updated[index]) return current;
      updated[index] = { productName: '', productId: '', quantity: updated[index].quantity };
      return updated;
    });
  };

  const handleAddRow = () => {
    setNewRecords([...newRecords, { productName: '', productId: '', quantity: '' }]);
  };

  const handleRemoveRow = (index: number) => {
    if (newRecords.length > 1) {
      const updated = newRecords.filter((_, i) => i !== index);
      setNewRecords(updated);
    }
  };

  const handleUpdateInventory = () => {
    if (isAdmin && !editingRecord.submittedBy) {
      alert('请选择提交人');
      return;
    }
    updateInventoryMutation.mutate(editingRecord);
  };

  const handleReviewInventory = () => {
    if (selectedRecord) {
      reviewInventoryMutation.mutate({
        id: selectedRecord.id,
        ...reviewData,
      });
    }
  };

  const handleOpenReviewModal = (record: InventoryRecord) => {
    setSelectedRecord(record);
    setReviewData({
      status: InventoryRecordStatus.APPROVED,
      quantity: record.quantity,
      remark: '',
    });
    setShowReviewModal(true);
  };

  const handleOpenEditModal = (record: InventoryRecord) => {
    setEditingRecord({
      id: record.id,
      productId: record.product?.id || record.productId,
      quantity: record.quantity,
      submittedBy: record.submittedBy,
      remark: record.remark || '',
    });
    setShowEditModal(true);
  };

  const handleDeleteInventory = (record: InventoryRecord) => {
    if (!window.confirm('确定要删除该入库单吗？')) return;
    deleteInventoryMutation.mutate(record.id);
  };

  const toggleSelection = (record: InventoryRecord) => {
    if (record.status !== InventoryRecordStatus.PENDING) {
      setErrorModalTitle('无法选择该记录');
      setErrorModalMessage('只有待审核的入库单可以批量通过或批量拒绝。');
      return;
    }
    const newSet = new Set(selectedRecordIds);
    if (newSet.has(record.id)) {
      newSet.delete(record.id);
    } else {
      newSet.add(record.id);
    }
    setSelectedRecordIds(newSet);
  };

  const selectAll = () => {
    if (selectableFilteredRecords.length === 0) {
      setErrorModalTitle('没有可审核记录');
      setErrorModalMessage('当前筛选结果中没有待审核的入库单。');
      return;
    }

    const next = new Set(selectedRecordIds);
    if (areAllSelectableRecordsSelected) {
      selectableFilteredRecords.forEach((record: InventoryRecord) => next.delete(record.id));
    } else {
      selectableFilteredRecords.forEach((record: InventoryRecord) => next.add(record.id));
    }
    setSelectedRecordIds(next);
  };

  const handleBatchReview = (status: InventoryRecordStatus) => {
    if (selectedRecordIds.size === 0) return;
    const pendingIds = Array.from(selectedRecordIds).filter((id) =>
      inventoryRecords?.some((record: InventoryRecord) => record.id === id && record.status === InventoryRecordStatus.PENDING)
    );
    if (pendingIds.length !== selectedRecordIds.size) {
      setSelectedRecordIds(new Set(pendingIds));
      setErrorModalTitle('选择内容已更新');
      setErrorModalMessage('部分记录已经完成审核，已自动移出选择。请确认后重新操作。');
      return;
    }
    if (!window.confirm(`确定要批量${status === InventoryRecordStatus.APPROVED ? '通过' : '拒绝'}选中的 ${pendingIds.length} 条待审核记录吗？`)) return;
    
    setIsBatchProcessing(true);
    batchReviewMutation.mutate({ ids: pendingIds, status });
  };

  const handleExport = () => {
    if (filteredRecords.length === 0) return;
    setIsExportDialogOpen(true);
  };

  const handleInventoryPdfExport = async (action: 'save' | 'share') => {
    if (filteredRecords.length === 0 || !inventoryExportRef.current) return;

    setIsExportingPdf(true);
    const exportDate = new Date().toISOString().split('T')[0];
    const filename = toSafePdfFileName(`入库单导出_${exportDate}`);

    try {
      const result = await exportPrintable(
        inventoryExportRef.current,
        {
          filename,
          orientation: 'landscape',
          marginMm: 12,
          title: filename.replace(/\.pdf$/i, ''),
          text: '入库单导出',
        },
        action,
      );

      if (result === 'fallback-download') {
        window.alert(getShareFallbackMessage());
      }
      if (result !== 'cancelled') {
        setIsExportDialogOpen(false);
      }
    } catch {
      window.alert('导出失败，请稍后重试。');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const getStatusBadgeClass = (status: InventoryRecordStatus) => {
    switch (status) {
      case InventoryRecordStatus.PENDING:
        return 'bg-yellow-100 text-yellow-800';
      case InventoryRecordStatus.APPROVED:
        return 'bg-green-100 text-green-800';
      case InventoryRecordStatus.REJECTED:
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: InventoryRecordStatus) => {
    switch (status) {
      case InventoryRecordStatus.PENDING:
        return '待审核';
      case InventoryRecordStatus.APPROVED:
        return '已通过';
      case InventoryRecordStatus.REJECTED:
        return '已拒绝';
      default:
        return '未知状态';
    }
  };

  const getSubmissionModeText = (mode?: InventoryRecordSubmissionMode) => {
    switch (mode) {
      case InventoryRecordSubmissionMode.ADMIN_ASSIGN:
        return '管理员分配';
      case InventoryRecordSubmissionMode.RETURN_DEDUCTION:
        return '退货扣款';
      case InventoryRecordSubmissionMode.EMPLOYEE_SUBMIT:
      default:
        return '员工提交';
    }
  };

  const getSubmissionModeBadgeClass = (mode?: InventoryRecordSubmissionMode) => {
    if (mode === InventoryRecordSubmissionMode.RETURN_DEDUCTION) {
      return 'bg-rose-100 text-rose-700';
    }
    return mode === InventoryRecordSubmissionMode.ADMIN_ASSIGN
      ? 'bg-blue-100 text-blue-800'
      : 'bg-slate-100 text-slate-700';
  };

  const editingProduct = getProductById(editingRecord.productId);

  return (
    <Layout>
      <PageHeader 
        title="入库单管理" 
        subtitle="管理生产入库记录" 
        action={{ label: isAdmin ? '新增入库单' : '提交入库单', onClick: openAddModal }}
      />

      <style>{`
        .inventory-print-layout {
          display: none;
        }
      `}</style>
      
      <div className="px-4 pb-4 pt-0 md:px-6 md:pb-6">
        <QueryStateBanner
          isLoading={isLoading}
          isError={Boolean(error)}
          loadingText="正在同步入库记录..."
          errorText="入库记录暂时无法同步，请确认后端服务已启动。"
          onRetry={() => refetch()}
        />
        <div className="-mx-4 overflow-hidden border-b border-line bg-white md:-mx-6">
          <FilterPanel
            totalCount={(inventoryRecords || []).length}
            filteredCount={filteredRecords.length}
            activeFilters={activeFilters}
            onClear={clearFilters}
            primary={
              <>
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
              <>
                <FilterField label="产品名称" className="lg:w-40">
                  <select
                    value={filterProduct}
                    onChange={(e) => {
                      setFilterProduct(e.target.value);
                      setFilterSpec('');
                    }}
                    className="block min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                  >
                    <option value="">所有产品</option>
                    {productNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </FilterField>

                <FilterField label="规格" className="lg:w-40">
                  <select
                    value={filterSpec}
                    onChange={(e) => setFilterSpec(e.target.value)}
                    className="block min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                  >
                    <option value="">所有规格</option>
                    {filterSpecOptions.map((specification) => (
                      <option key={specification} value={specification}>
                        {specification}
                      </option>
                    ))}
                  </select>
                </FilterField>

                {userRole !== UserRole.PIECE_RATE && (
                  <FilterField label="提交人" className="lg:w-40">
                    <select
                      value={filterSubmitter}
                      onChange={(e) => setFilterSubmitter(e.target.value)}
                      className="block min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    >
                      <option value="">所有提交人</option>
                      {submitterNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </FilterField>
                )}

                <FilterField label="状态" className="lg:w-40">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="block min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                  >
                    <option value="all">所有状态</option>
                    <option value={InventoryRecordStatus.PENDING}>待审核</option>
                    <option value={InventoryRecordStatus.APPROVED}>已通过</option>
                    <option value={InventoryRecordStatus.REJECTED}>已拒绝</option>
                  </select>
                </FilterField>
              </>
            }
            actions={
              <button
                onClick={handleExport}
                disabled={filteredRecords.length === 0}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-transparent bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="mr-2 h-4 w-4" />
                导出
              </button>
            }
          />

          {/* 批量操作栏 */}
          {selectedRecordIds.size > 0 && getUserRole() !== UserRole.PIECE_RATE && (
            <div className="flex flex-col gap-3 border-b border-blue-200 bg-blue-50 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <span className="text-blue-700 font-medium">已选择 {selectedRecordIds.size} 条待审核记录</span>
                <span className="block text-xs text-blue-600 md:ml-3 md:inline">已通过和已拒绝记录不可重复审核</span>
              </div>
              <div className="grid grid-cols-2 gap-2 md:flex md:gap-3">
                <button
                  onClick={() => handleBatchReview(InventoryRecordStatus.APPROVED)}
                  disabled={isBatchProcessing}
                  className="min-h-11 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  批量通过
                </button>
                <button
                  onClick={() => handleBatchReview(InventoryRecordStatus.REJECTED)}
                  disabled={isBatchProcessing}
                  className="min-h-11 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  批量拒绝
                </button>
              </div>
            </div>
          )}

          {!isLoading && filteredRecords.length === 0 ? (
            <div className="p-6">
              <ActionableEmptyState
                icon={FileText}
                title={(inventoryRecords || []).length ? '没有符合筛选条件的入库单' : '创建第一张入库单'}
                description={(inventoryRecords || []).length ? '当前筛选下没有入库记录，清除筛选后可继续查看全部生产入库。' : '入库单会写入库存，并按产品入库单价计算产值和计件工资。'}
                actionLabel={(inventoryRecords || []).length ? '清除筛选' : isAdmin ? '新增入库单' : '提交入库单'}
                onAction={() => {
                  if ((inventoryRecords || []).length) {
                    clearFilters();
                    return;
                  }
                  openAddModal();
                }}
              />
            </div>
          ) : filteredRecords.length > 0 ? (
          <>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[1000px] w-full">
              <thead className="bg-gray-50">
                <tr>
                  {getUserRole() !== UserRole.PIECE_RATE && (
                    <th className="px-6 py-3 w-12 text-center">
                      <button 
                        onClick={selectAll}
                        className="text-gray-500 hover:text-gray-700 disabled:cursor-not-allowed disabled:text-gray-300"
                        disabled={selectableFilteredRecords.length === 0}
                        title={selectableFilteredRecords.length === 0 ? '当前没有待审核记录' : '选择当前筛选中的待审核记录'}
                      >
                        {areAllSelectableRecordsSelected ? (
                          <CheckSquare className="w-5 h-5 text-blue-600" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">入库单编号</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">产品名称</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">规格</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">数量</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">单位</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">单价</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">总金额</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">提交人</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">来源</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">备注</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredRecords.map((record: InventoryRecord) => (
                  <tr key={record.id}>
                    {getUserRole() !== UserRole.PIECE_RATE && (
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => toggleSelection(record)}
                          disabled={record.status !== InventoryRecordStatus.PENDING}
                          className="disabled:cursor-not-allowed"
                          title={record.status === InventoryRecordStatus.PENDING ? '选择待审核记录' : '该记录已审核，不能重复处理'}
                        >
                          {selectedRecordIds.has(record.id) ? (
                            <CheckSquare className="w-5 h-5 text-blue-600" />
                          ) : (
                            <Square className={`w-5 h-5 ${
                              record.status === InventoryRecordStatus.PENDING ? 'text-gray-300' : 'text-gray-200'
                            }`} />
                          )}
                        </button>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {record.recordNumber || `#${record.id.slice(0, 8)}`}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{record.product?.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{record.product?.specification}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {record.quantity}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {record.product?.unit}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      ¥{formatUnitPrice(record.unitPrice)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                      ¥{formatAmountDetail(record.totalAmount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {record.submitter?.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getSubmissionModeBadgeClass(record.submissionMode)}`}>
                        {getSubmissionModeText(record.submissionMode)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(record.status)}`}>
                        {getStatusText(record.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div className="max-w-[180px] truncate" title={record.remark || ''}>
                        {record.remark || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {record.status === InventoryRecordStatus.PENDING && (
                        <button
                          onClick={() => handleOpenReviewModal(record)}
                          className="text-blue-600 hover:text-blue-900"
                          title="审核"
                        >
                          <FileText className="w-5 h-5" />
                        </button>
                      )}
                      {record.status === InventoryRecordStatus.REJECTED && userRole !== UserRole.ADMIN && (
                        <button
                          onClick={() => handleOpenEditModal(record)}
                          className="text-blue-600 hover:text-blue-900 ml-2"
                          title="修改并重新提交"
                        >
                          <Edit className="w-5 h-5" />
                        </button>
                      )}
                      {userRole === UserRole.ADMIN && record.status === InventoryRecordStatus.APPROVED && (
                        <button
                          onClick={() => handleOpenEditModal(record)}
                          className="text-blue-600 hover:text-blue-900 ml-2"
                          title="编辑"
                        >
                          <Edit className="w-5 h-5" />
                        </button>
                      )}
                      {userRole === UserRole.ADMIN && record.status === InventoryRecordStatus.APPROVED && (
                        <button
                          onClick={() => handleDeleteInventory(record)}
                          className="text-red-600 hover:text-red-900 ml-2"
                          title="删除"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 p-4 md:hidden">
            {filteredRecords.map((record: InventoryRecord) => (
              <MobileRecordCard key={record.id}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-gray-900">
                      {record.recordNumber || `#${record.id.slice(0, 8)}`}
                    </div>
                    <div className="mt-1 text-sm text-gray-500">
                      {record.product?.name || '-'} · {record.product?.specification || '-'}
                    </div>
                  </div>
                  {getUserRole() !== UserRole.PIECE_RATE && (
                    <button
                      onClick={() => toggleSelection(record)}
                      disabled={record.status !== InventoryRecordStatus.PENDING}
                      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 disabled:cursor-not-allowed disabled:text-gray-300"
                      title={record.status === InventoryRecordStatus.PENDING ? '选择待审核记录' : '该记录已审核，不能重复处理'}
                    >
                      {selectedRecordIds.has(record.id) ? (
                        <CheckSquare className="h-5 w-5 text-blue-600" />
                      ) : (
                        <Square className="h-5 w-5" />
                      )}
                    </button>
                  )}
                </div>

                <MobileFieldGrid>
                  <MobileField label="数量" value={`${record.quantity} ${record.product?.unit || ''}`} />
                  <MobileField label="总金额" value={`¥${formatAmountDetail(record.totalAmount)}`} align="right" />
                  <MobileField label="单价" value={`¥${formatUnitPrice(record.unitPrice)}`} />
                  <MobileField label="提交人" value={record.submitter?.name || '-'} align="right" />
                  <MobileField
                    label="来源"
                    value={
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getSubmissionModeBadgeClass(record.submissionMode)}`}>
                        {getSubmissionModeText(record.submissionMode)}
                      </span>
                    }
                  />
                  <MobileField
                    label="状态"
                    align="right"
                    value={
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusBadgeClass(record.status)}`}>
                        {getStatusText(record.status)}
                      </span>
                    }
                  />
                </MobileFieldGrid>

                {record.remark && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <div className="text-xs text-gray-500">备注</div>
                    <div className="mt-1 break-words text-sm text-gray-900">{record.remark}</div>
                  </div>
                )}

                <MobileActionBar>
                  {record.status === InventoryRecordStatus.PENDING && (
                    <button
                      onClick={() => handleOpenReviewModal(record)}
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-100 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
                    >
                      <FileText className="h-4 w-4" />
                      审核
                    </button>
                  )}
                  {record.status === InventoryRecordStatus.REJECTED && userRole !== UserRole.ADMIN && (
                    <button
                      onClick={() => handleOpenEditModal(record)}
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-100 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
                    >
                      <Edit className="h-4 w-4" />
                      修改
                    </button>
                  )}
                  {userRole === UserRole.ADMIN && record.status === InventoryRecordStatus.APPROVED && (
                    <>
                      <button
                        onClick={() => handleOpenEditModal(record)}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-100 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
                      >
                        <Edit className="h-4 w-4" />
                        编辑
                      </button>
                      <button
                        onClick={() => handleDeleteInventory(record)}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-100 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        删除
                      </button>
                    </>
                  )}
                </MobileActionBar>
              </MobileRecordCard>
            ))}
          </div>
          </>
          ) : null}
        </div>
      </div>

      {isExportDialogOpen && (
        <ExportActionDialog
          title="导出入库单"
          description={`当前筛选共 ${filteredRecords.length} 条记录，可保存 PDF，或打开系统分享面板后选择微信。`}
          isProcessing={isExportingPdf}
          onSave={() => handleInventoryPdfExport('save')}
          onShare={() => handleInventoryPdfExport('share')}
          onClose={() => setIsExportDialogOpen(false)}
        />
      )}

      {isExportDialogOpen && (
        <div ref={inventoryExportRef} className="inventory-print-layout">
          <div className="inventory-print-sheet bg-white text-gray-900">
            <header className="border-b border-gray-900 pb-4">
              <div className="flex items-end justify-between gap-6">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-gray-500">Kinko Inventory Report</p>
                  <h2 className="mt-2 text-[22px] font-semibold text-gray-900">入库单导出</h2>
                  <p className="mt-2 text-[12px] text-gray-700">
                    筛选：日期 {filterDateRange.startDate || '不限'} 至 {filterDateRange.endDate || '不限'} / 产品 {filterProduct || '全部'} / 规格 {filterSpec || '全部'} / 提交人 {filterSubmitter || '全部'} / 状态 {filterStatus === 'all' ? '全部' : getStatusText(filterStatus as InventoryRecordStatus)}
                  </p>
                </div>
                <div className="text-right text-[12px] text-gray-700">
                  <p>生成时间: {new Date().toLocaleString('zh-CN', { hour12: false })}</p>
                  <p>记录数: {filteredRecords.length} 条</p>
                  <p>总数量: {filteredRecords.reduce((sum: number, record: InventoryRecord) => sum + Number(record.quantity || 0), 0)}</p>
                  <p>总金额: ¥{formatAmount(filteredRecords.reduce((sum: number, record: InventoryRecord) => sum + Number(record.totalAmount || 0), 0))}</p>
                </div>
              </div>
            </header>

            <div className="pt-4">
              <table className="inventory-print-table w-full border-collapse">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">入库单编号</th>
                    <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">产品名称</th>
                    <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">规格</th>
                    <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">数量</th>
                    <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">单位</th>
                    <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">单价</th>
                    <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">总金额</th>
                    <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">提交人</th>
                    <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">来源</th>
                    <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">状态</th>
                    <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">日期</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record: InventoryRecord) => (
                    <tr key={record.id}>
                      <td className="border border-gray-900 px-2 py-3 text-sm text-gray-900">{record.recordNumber || `#${record.id.slice(0, 8)}`}</td>
                      <td className="border border-gray-900 px-2 py-3 text-sm text-gray-900">{record.product?.name || '-'}</td>
                      <td className="border border-gray-900 px-2 py-3 text-sm text-gray-700">{record.product?.specification || '-'}</td>
                      <td className="border border-gray-900 px-2 py-3 text-right text-sm text-gray-900">{record.quantity}</td>
                      <td className="border border-gray-900 px-2 py-3 text-center text-sm text-gray-700">{record.product?.unit || '-'}</td>
                      <td className="border border-gray-900 px-2 py-3 text-right text-sm text-gray-900">{formatUnitPrice(record.unitPrice)}</td>
                      <td className="border border-gray-900 px-2 py-3 text-right text-sm font-medium text-gray-900">¥{formatAmountDetail(record.totalAmount)}</td>
                      <td className="border border-gray-900 px-2 py-3 text-sm text-gray-900">{record.submitter?.name || '-'}</td>
                      <td className="border border-gray-900 px-2 py-3 text-sm text-gray-700">{getSubmissionModeText(record.submissionMode)}</td>
                      <td className="border border-gray-900 px-2 py-3 text-sm text-gray-700">{getStatusText(record.status)}</td>
                      <td className="border border-gray-900 px-2 py-3 text-center text-sm text-gray-700">{new Date(record.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 添加入库单模态框 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-600 bg-opacity-50 sm:items-center">
          <div className="max-h-[92vh] w-full overflow-hidden rounded-t-2xl border bg-white shadow-lg sm:max-w-2xl sm:rounded-lg">
            <div className="p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                {isAdmin ? '管理员分配入库' : '员工提交入库单'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4 max-h-[62vh] overflow-y-auto pr-1 sm:pr-2">
              <div className={`p-3 rounded-lg border ${isAdmin ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-1">当前模式</div>
                    <div className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getSubmissionModeBadgeClass(currentSubmissionMode)}`}>
                      {getSubmissionModeText(currentSubmissionMode)}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  {isAdmin ? '保存后立即入库，不走审核。' : '提交后进入待审核，管理员审核通过后才会正式入库。'}
                </p>
              </div>
              {isAdmin && (
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <label className="block text-xs font-medium text-gray-500 mb-1">提交人 / 归属员工</label>
                  <select
                    value={selectedSubmitterId}
                    onChange={(e) => setSelectedSubmitterId(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  >
                    {activeAssignableUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} {user.code ? `(${user.code})` : ''}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              {newRecords.map((record, index) => {
                const selectedProduct = getProductById(record.productId);
                const isNewProduct = Boolean(record.newProduct);
                const unitLabel = isNewProduct ? record.newProduct?.unit : selectedProduct?.unit;
                const canEditCost = !isNewProduct && Boolean(selectedProduct) && Number(selectedProduct?.costPrice ?? 0) === 0;

                return (
                  <div key={index} className="grid grid-cols-1 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100 relative group sm:grid-cols-[minmax(0,1fr)_6rem_7rem] sm:items-start">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">产品 {index + 1}</label>
                      {isNewProduct ? (
                        <div className="flex min-h-[42px] items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
                          <span className="truncate text-blue-700">
                            新建：{record.newProduct?.name} - {record.newProduct?.specification}
                          </span>
                          <button
                            type="button"
                            onClick={() => clearNewProduct(index)}
                            className="ml-2 shrink-0 text-blue-500 transition-colors hover:text-blue-700"
                            title="重新选择产品"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <ProductAutocomplete
                          products={products}
                          value={record.productId}
                          onSelect={(productId) => handleUpdateRecord(index, 'productId', productId)}
                          allowCreate
                          onCreateNew={(name) => openQuickCreate(index, name)}
                          placeholder="输入产品名称或规格"
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        数量 {unitLabel ? `(${unitLabel})` : ''}
                      </label>
                      <input
                        type="number"
                        min="0.0001"
                        step="0.0001"
                        value={record.quantity}
                        onChange={(e) => handleUpdateRecord(index, 'quantity', e.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">入库单价</label>
                      {isNewProduct ? (
                        <div className="block w-full px-3 py-2 border border-gray-200 rounded-md bg-white text-right text-sm text-gray-900 shadow-sm">
                          ¥{formatUnitPrice(record.newProduct?.costPrice ?? 0)}
                        </div>
                      ) : canEditCost ? (
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={record.costPriceOverride ?? ''}
                          placeholder="补填单价"
                          onChange={(e) => handleUpdateRecord(index, 'costPriceOverride', e.target.value)}
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md text-right shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        />
                      ) : (
                        <div className="block w-full px-3 py-2 border border-gray-200 rounded-md bg-white text-right text-sm text-gray-900 shadow-sm">
                          {selectedProduct ? `¥${formatUnitPrice(selectedProduct.costPrice)}` : '-'}
                        </div>
                      )}
                    </div>
                    {newRecords.length > 1 && (
                      <button
                        onClick={() => handleRemoveRow(index)}
                        className="absolute -top-2 -right-2 bg-white text-gray-400 hover:text-red-500 rounded-full p-1 shadow-sm border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="删除此行"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
              
              <button
                onClick={handleAddRow}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-2 text-gray-500 transition-colors hover:border-blue-500 hover:text-blue-500"
              >
                <Plus className="w-4 h-4" />
                添加更多产品
              </button>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={() => setShowAddModal(false)}
                className="min-h-11 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleAddInventory}
                className="min-h-11 rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {isAdmin ? '保存并立即入库' : '提交入库单'}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {quickCreateIndex !== null && (
        <QuickCreateProductForm
          initialName={quickCreateName}
          priceLabel="入库单价"
          onCancel={() => {
            setQuickCreateIndex(null);
            setQuickCreateName('');
          }}
          onConfirm={confirmQuickCreate}
        />
      )}

      {errorModalMessage && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-600 bg-opacity-50 sm:items-center">
          <div className="w-full rounded-t-2xl border bg-white p-6 shadow-lg sm:max-w-[420px] sm:rounded-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">{errorModalTitle}</h3>
              <button
                onClick={() => setErrorModalMessage('')}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap">{errorModalMessage}</div>
            <div className="flex justify-end mt-6">
              <button
                onClick={() => setErrorModalMessage('')}
                className="min-h-11 w-full rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 审核入库单模态框 */}
      {showReviewModal && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-600 bg-opacity-50 sm:items-center">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border bg-white p-5 shadow-lg sm:w-96 sm:rounded-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">审核入库单</h3>
              <button
                onClick={() => setShowReviewModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4 mb-4">
              <div className="border-b pb-2">
                <div className="text-sm font-medium text-gray-700">产品信息</div>
                <div className="text-sm text-gray-900">{selectedRecord.product?.name} - {selectedRecord.product?.specification}</div>
              </div>
              <div className="border-b pb-2">
                <div className="text-sm font-medium text-gray-700">提交信息</div>
                <div className="text-sm text-gray-900">提交人: {selectedRecord.submitter?.name}</div>
                <div className="text-sm text-gray-900">来源: {getSubmissionModeText(selectedRecord.submissionMode)}</div>
                <div className="text-sm text-gray-500">提交时间: {new Date(selectedRecord.createdAt).toLocaleString()}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">审核状态</label>
                <div className="mt-1 space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="status"
                      value={InventoryRecordStatus.APPROVED}
                      checked={reviewData.status === InventoryRecordStatus.APPROVED}
                      onChange={(e) => setReviewData({ ...reviewData, status: e.target.value as InventoryRecordStatus })}
                      className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300"
                    />
                    <span className="ml-2 text-sm text-gray-700">通过</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="status"
                      value={InventoryRecordStatus.REJECTED}
                      checked={reviewData.status === InventoryRecordStatus.REJECTED}
                      onChange={(e) => setReviewData({ ...reviewData, status: e.target.value as InventoryRecordStatus })}
                      className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300"
                    />
                    <span className="ml-2 text-sm text-gray-700">拒绝</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">实际数量 {selectedRecord.product?.unit ? `(${selectedRecord.product.unit})` : ''}</label>
                <input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={reviewData.quantity}
                  onChange={(e) => setReviewData({ ...reviewData, quantity: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">备注</label>
                <textarea
                  value={reviewData.remark}
                  onChange={(e) => setReviewData({ ...reviewData, remark: e.target.value })}
                  rows={3}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                ></textarea>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={() => setShowReviewModal(false)}
                className="min-h-11 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleReviewInventory}
                className="min-h-11 rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                提交审核
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 修改入库单模态框 */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-600 bg-opacity-50 sm:items-center">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border bg-white p-5 shadow-lg sm:w-96 sm:rounded-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                {isAdmin ? '修改已入库单' : '修改入库单'}
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              {isAdmin && (
                <div className="p-3 rounded-lg border border-blue-100 bg-blue-50">
                  <div className="text-xs font-medium text-gray-500 mb-1">处理说明</div>
                  <p className="text-xs text-gray-600">保存后会即时修正库存，不会改回待审核。</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700">产品</label>
                <ProductAutocomplete
                  products={products}
                  value={editingRecord.productId}
                  onSelect={(productId) => setEditingRecord({ ...editingRecord, productId })}
                  placeholder="输入产品名称或规格"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
                <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  入库单价：{editingProduct ? `¥${formatUnitPrice(editingProduct.costPrice)}` : '-'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  数量 {editingProduct?.unit ? `(${editingProduct.unit})` : ''}
                </label>
                <input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={editingRecord.quantity}
                  onChange={(e) => setEditingRecord({ ...editingRecord, quantity: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              {isAdmin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">提交人 / 归属员工</label>
                  <select
                    value={editingRecord.submittedBy}
                    onChange={(e) => setEditingRecord({ ...editingRecord, submittedBy: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  >
                    {activeAssignableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} {user.code ? `(${user.code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {isAdmin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">备注</label>
                  <textarea
                    value={editingRecord.remark}
                    onChange={(e) => setEditingRecord({ ...editingRecord, remark: e.target.value })}
                    rows={3}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  ></textarea>
                </div>
              )}
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={() => setShowEditModal(false)}
                className="min-h-11 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleUpdateInventory}
                className="min-h-11 rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {isAdmin ? '保存修改' : '重新提交'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Inventory;
