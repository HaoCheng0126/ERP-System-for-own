import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Edit, Loader2, PlusCircle, Trash2, Truck, X } from 'lucide-react';
import ActionableEmptyState from '../components/ActionableEmptyState';
import DateField from '../components/DateField';
import ExportActionDialog from '../components/ExportActionDialog';
import FilterPanel, { ActiveFilter, DateShortcutGroup, FilterField, SearchInput } from '../components/FilterPanel';
import Layout from '../components/Layout';
import { MobileField, MobileFieldGrid, MobileRecordCard } from '../components/MobileRecordCard';
import PageHeader from '../components/PageHeader';
import ProductAutocomplete from '../components/ProductAutocomplete';
import QueryStateBanner from '../components/QueryStateBanner';
import { Company, CustomerType, DeliveryOrder, DeliveryOrderStatus, Product, User, UserRole } from '../types';
import { groupDeliveryOrders } from '../utils/deliveryGrouping';
import { formatAmount, formatAmountDetail, formatDisplayDecimal, formatEditableDecimal, formatUnitPrice, unitLabel } from '../utils/format';
import { DateRangeShortcut, getDateRangeByShortcut, matchesKeyword } from '../utils/filtering';
import useDebouncedValue from '../hooks/useDebouncedValue';
import { useCounterparties } from '../hooks/useCounterparties';
import api from '../utils/api';
import { fileToDownscaledDataUrl } from '../utils/image';
import { exportPrintable, getShareFallbackMessage, toSafePdfFileName } from '../utils/printShare';
import { numberToRmbCapital } from '../utils/rmbCapital';
import QuickCreateProductForm, { QuickCreateProductDraft } from '../components/QuickCreateProductForm';
import DisclosureSection from '../components/records/DisclosureSection';
import DateSectionHeader from '../components/records/DateSectionHeader';
import EntityCardHeader from '../components/records/EntityCardHeader';

const DELIVERY_STATUS_BADGES: Record<DeliveryOrderStatus, { label: string; className: string }> = {
  [DeliveryOrderStatus.SETTLED]: { label: '已结清', className: 'bg-emerald-50 text-emerald-700' },
  [DeliveryOrderStatus.PARTIAL]: { label: '部分结清', className: 'bg-amber-50 text-amber-700' },
  [DeliveryOrderStatus.PENDING]: { label: '未结清', className: 'bg-slate-100 text-slate-600' },
};

// 送货单导出时每张单据至少铺满的行数，使数据较少的单据也保持传统表单的版式
const DELIVERY_SLIP_MIN_ROWS = 5;

// —— 送货单图像识别：后端返回的草稿结构 + 与现有客户/产品的模糊匹配 ——
type RecognizedDeliveryItem = {
  productName: string;
  specification: string | null;
  quantity: number | null;
  unitPrice: number | null;
};
type RecognizedDelivery = {
  customerName: string | null;
  deliveryDate: string | null;
  items: RecognizedDeliveryItem[];
};

const normalizeForMatch = (value: string | null | undefined) =>
  (value || '').trim().toLowerCase().replace(/\s+/g, '');

const matchCustomerId = (candidates: { id: string; name: string }[], name: string | null): string => {
  const target = normalizeForMatch(name);
  if (!target) return '';
  const exact = candidates.find((c) => normalizeForMatch(c.name) === target);
  if (exact) return exact.id;
  const partial = candidates.find(
    (c) => normalizeForMatch(c.name).includes(target) || target.includes(normalizeForMatch(c.name)),
  );
  return partial ? partial.id : '';
};

const matchRecognizedProduct = (
  candidates: Product[],
  name: string,
  specification: string | null,
): Product | undefined => {
  const targetName = normalizeForMatch(name);
  if (!targetName) return undefined;
  const targetSpec = normalizeForMatch(specification);
  return (
    candidates.find(
      (p) => normalizeForMatch(p.name) === targetName && (!targetSpec || normalizeForMatch(p.specification) === targetSpec),
    ) ||
    candidates.find((p) => normalizeForMatch(p.name) === targetName) ||
    candidates.find((p) => normalizeForMatch(p.name).includes(targetName) || targetName.includes(normalizeForMatch(p.name)))
  );
};

type DeliveryOrderForm = {
  customerId: string;
  deliveryDate: string;
  items: DeliveryOrderFormItem[];
  remark: string;
};

type DeliveryOrderFormItem = {
  productId: string;
  productName: string;
  specification: string;
  quantity: string | number;
  unitPrice: string | number;
  newProduct?: { name: string; specification: string; unit: string; unitPrice: number };
  inboundAllocations?: { employeeId: string; quantity: string | number }[];
};

// 分配入库目标：'__direct__' 表示「直接入库（不计工资）」，仅加库存、不计任何员工工资。
const DIRECT_INBOUND = '__direct__';

const createEmptyOrder = (): DeliveryOrderForm => ({
  customerId: '',
  deliveryDate: '',
  items: [{ productId: '', productName: '', specification: '', quantity: '', unitPrice: '' }],
  remark: '',
});

const Delivery: React.FC = () => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [filterDateRange, setFilterDateRange] = useState({
    startDate: '',
    endDate: '',
  });
  const [filterProductName, setFilterProductName] = useState('');
  const [filterSpec, setFilterSpec] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCompanyIds, setExpandedCompanyIds] = useState<Set<string>>(new Set());
  const [exportCompanyId, setExportCompanyId] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [newOrder, setNewOrder] = useState<DeliveryOrderForm>(createEmptyOrder());
  const [quickCreateIndex, setQuickCreateIndex] = useState<number | null>(null);
  const [quickCreateName, setQuickCreateName] = useState('');
  // 编辑送货单时记录原始明细：后端会先把这些数量加回库存，前端据此算「编辑后新增缺口」
  const [editOriginalItems, setEditOriginalItems] = useState<{ productId: string; quantity: number }[]>([]);
  const printableCompanyRef = useRef<HTMLDivElement>(null);
  const unitPriceFocusValueRef = useRef<Record<number, string | number>>({});
  const debouncedSearchTerm = useDebouncedValue(searchTerm);

  const queryClient = useQueryClient();

  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognizeError, setRecognizeError] = useState<string | null>(null);
  const recognizeInputRef = useRef<HTMLInputElement>(null);

  const resetEditorState = () => {
    setShowAddModal(false);
    setIsEditing(false);
    setEditingOrderId(null);
    setNewOrder(createEmptyOrder());
    setEditOriginalItems([]);
    setRecognizeError(null);
    unitPriceFocusValueRef.current = {};
  };

  const openCreateModal = () => {
    setIsEditing(false);
    setEditingOrderId(null);
    setNewOrder(createEmptyOrder());
    setEditOriginalItems([]);
    setShowAddModal(true);
  };

  const { data: deliveryOrders, isLoading, error, refetch } = useQuery({
    queryKey: ['deliveryOrders'],
    queryFn: async () => {
      const response = await api.get('/delivery');
      return response.data as DeliveryOrder[];
    },
  });

  const { data: customers } = useCounterparties(CustomerType.CLIENT);

  const { data: products } = useQuery({
    queryKey: ['products', 'finished'],
    queryFn: async () => {
      const response = await api.get('/products?type=finished');
      return response.data as Product[];
    },
  });

  // 图像识别：上传送货单照片 → 后端结构化 → 回填表单（仅草稿，用户二次编辑后再提交）。
  const handleRecognizeImage = async (file: File) => {
    setIsRecognizing(true);
    setRecognizeError(null);
    try {
      const dataUrl = await fileToDownscaledDataUrl(file);
      const { data } = await api.post('/delivery/recognize', { image: dataUrl });
      const recognized = data as RecognizedDelivery;

      const customerId = matchCustomerId(customers || [], recognized.customerName);
      const mappedItems: DeliveryOrderFormItem[] = (recognized.items || []).map((item) => {
        const product = matchRecognizedProduct(products || [], item.productName, item.specification);
        return {
          productId: product?.id || '',
          productName: item.productName || '',
          specification: item.specification || '',
          quantity: item.quantity != null ? String(item.quantity) : '',
          unitPrice: item.unitPrice != null ? String(item.unitPrice) : '',
        };
      });

      setNewOrder({
        customerId,
        deliveryDate: recognized.deliveryDate || '',
        items: mappedItems.length ? mappedItems : createEmptyOrder().items,
        remark: '',
      });

      const unmatchedCustomer = Boolean(recognized.customerName) && !customerId;
      const unmatchedProducts = mappedItems.filter((item) => !item.productId).length;
      if (unmatchedCustomer || unmatchedProducts > 0) {
        const parts = [unmatchedCustomer ? '客户未匹配' : '', unmatchedProducts ? `${unmatchedProducts} 个产品未匹配` : '']
          .filter(Boolean)
          .join('、');
        setRecognizeError(`已回填，请核对后提交（${parts}）`);
      }
    } catch (error: any) {
      setRecognizeError(error?.response?.data?.message || error?.message || '识别失败，请重试');
    } finally {
      setIsRecognizing(false);
      if (recognizeInputRef.current) recognizeInputRef.current.value = '';
    }
  };

  const { data: company } = useQuery({
    queryKey: ['company'],
    queryFn: async () => {
      const response = await api.get('/company');
      return response.data as Company;
    },
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await api.get('/users');
      return response.data as User[];
    },
  });
  const assignableEmployees = useMemo(
    () => (users || []).filter((user) => user.isActive && user.role === UserRole.PIECE_RATE),
    [users],
  );

  const getProductById = (productId: string) => (products || []).find((product) => product.id === productId);
  const productNames = useMemo(
    () => Array.from(new Set((products || []).map((product) => product.name))).sort((left, right) => left.localeCompare(right, 'zh-CN')),
    [products],
  );
  const filterSpecOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (products || [])
            .filter((product) => !filterProductName || product.name === filterProductName)
            .map((product) => product.specification),
        ),
      ).sort((left, right) => left.localeCompare(right, 'zh-CN')),
    [filterProductName, products],
  );

  const createDeliveryMutation = useMutation({
    mutationFn: async (order: DeliveryOrderForm) => {
      const payload = {
        ...order,
        items: order.items.map((item) => {
          const allocations = (item.inboundAllocations || [])
            .filter((allocation) => allocation.employeeId && Number(allocation.quantity) > 0)
            .map((allocation) => ({ employeeId: allocation.employeeId, quantity: Number(allocation.quantity) }));
          return {
            ...(item.newProduct ? { newProduct: item.newProduct } : { productId: item.productId }),
            quantity: Number(item.quantity),
            unitPrice: item.unitPrice === '' ? undefined : Number(item.unitPrice),
            ...(allocations.length > 0 ? { inboundAllocations: allocations } : {}),
          };
        }),
      };
      const response = await api.post('/delivery', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliveryOrders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['salesStats'] });
      queryClient.invalidateQueries({ queryKey: ['customerStats'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
      queryClient.invalidateQueries({ queryKey: ['salaryReport'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryRecords'] });
      resetEditorState();
    },
  });

  const updateDeliveryMutation = useMutation({
    mutationFn: async ({ id, order }: { id: string; order: DeliveryOrderForm }) => {
      const payload = {
        ...order,
        items: order.items.map((item) => {
          const allocations = (item.inboundAllocations || [])
            .filter((allocation) => allocation.employeeId && Number(allocation.quantity) > 0)
            .map((allocation) => ({ employeeId: allocation.employeeId, quantity: Number(allocation.quantity) }));
          return {
            ...(item.newProduct ? { newProduct: item.newProduct } : { productId: item.productId }),
            quantity: Number(item.quantity),
            unitPrice: item.unitPrice === '' ? undefined : Number(item.unitPrice),
            ...(allocations.length > 0 ? { inboundAllocations: allocations } : {}),
          };
        }),
      };
      const response = await api.put(`/delivery/${id}`, payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliveryOrders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['salesStats'] });
      queryClient.invalidateQueries({ queryKey: ['customerStats'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
      queryClient.invalidateQueries({ queryKey: ['salaryReport'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryRecords'] });
      resetEditorState();
    },
  });

  const deleteDeliveryMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/delivery/${id}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliveryOrders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['salesStats'] });
      queryClient.invalidateQueries({ queryKey: ['customerStats'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
    },
  });

  const handleAddItem = () => {
    setNewOrder((current) => ({
      ...current,
      items: [...current.items, { productId: '', productName: '', specification: '', quantity: '', unitPrice: '' }],
    }));
  };

  const handleRemoveItem = (index: number) => {
    setNewOrder((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const fetchCustomerPrice = async (productId: string, customerId: string) => {
    try {
      const response = await api.get(`/products/${productId}/prices/${customerId}`);
      const data = response.data;
      if (data && data.price !== undefined) {
        return Number(data.price);
      }
      return undefined;
    } catch {
      return undefined;
    }
  };

  const updateItemUnitPrice = async (index: number, productId: string, customerId: string) => {
    if (!customerId || !productId) {
      setNewOrder((current) => {
        const items = [...current.items];
        if (!items[index]) return current;
        items[index] = { ...items[index], unitPrice: '' };
        return { ...current, items };
      });
      return;
    }

    const price = await fetchCustomerPrice(productId, customerId);
    setNewOrder((current) => {
      const items = [...current.items];
      if (!items[index] || items[index].productId !== productId) return current;
      items[index] = {
        ...items[index],
        unitPrice: price === undefined ? '' : formatEditableDecimal(price),
      };
      return { ...current, items };
    });
  };

  const handleItemChange = async (index: number, field: keyof DeliveryOrderFormItem, value: string | number) => {
    const nextItems = [...newOrder.items];

    if (field === 'productId') {
      const product = products?.find((item) => item.id === value);
      nextItems[index] = {
        ...nextItems[index],
        productId: value as string,
        productName: product?.name || '',
        specification: product?.specification || '',
        unitPrice: '',
        inboundAllocations: undefined,
      };
    } else if (field === 'productName') {
      nextItems[index] = {
        ...nextItems[index],
        productName: value as string,
        specification: '',
        productId: '',
        unitPrice: '',
        inboundAllocations: undefined,
      };
    } else if (field === 'specification') {
      const product = products?.find(
        (item) => item.name === nextItems[index].productName && item.specification === value,
      );
      nextItems[index] = {
        ...nextItems[index],
        specification: value as string,
        productId: product?.id || '',
        unitPrice: '',
        inboundAllocations: undefined,
      };
    } else {
      nextItems[index] = { ...nextItems[index], [field]: value };
    }

    setNewOrder({ ...newOrder, items: nextItems });

    if ((field === 'productId' || field === 'specification') && nextItems[index].productId && newOrder.customerId) {
      await updateItemUnitPrice(index, nextItems[index].productId, newOrder.customerId);
    }
  };

  const handleCustomerChange = async (customerId: string) => {
    const itemsSnapshot = newOrder.items;
    if (!customerId) {
      setNewOrder({
        ...newOrder,
        customerId,
        items: itemsSnapshot.map((item) => ({ ...item, unitPrice: '' })),
      });
      return;
    }

    const updatedItems = await Promise.all(
      itemsSnapshot.map(async (item) => {
        if (!item.productId) return { ...item, unitPrice: '' };
        const price = await fetchCustomerPrice(item.productId, customerId);
        return {
          ...item,
          unitPrice: price === undefined ? '' : formatEditableDecimal(price),
        };
      }),
    );

    setNewOrder({
      ...newOrder,
      customerId,
      items: updatedItems,
    });
  };

  const handleCreateOrUpdateOrder = () => {
    if (isEditing && editingOrderId) {
      updateDeliveryMutation.mutate({ id: editingOrderId, order: newOrder });
      return;
    }

    createDeliveryMutation.mutate(newOrder);
  };

  const openQuickCreate = (index: number, name: string) => {
    setQuickCreateIndex(index);
    setQuickCreateName(name);
  };

  const confirmQuickCreate = (draft: QuickCreateProductDraft) => {
    if (quickCreateIndex === null) return;
    const index = quickCreateIndex;
    setNewOrder((current) => {
      const items = [...current.items];
      if (!items[index]) return current;
      items[index] = {
        ...items[index],
        productId: '',
        productName: `${draft.name} - ${draft.specification}`,
        specification: draft.specification,
        unitPrice: formatEditableDecimal(draft.price),
        inboundAllocations: undefined,
        newProduct: {
          name: draft.name,
          specification: draft.specification,
          unit: draft.unit,
          unitPrice: draft.price,
        },
      };
      return { ...current, items };
    });
    setQuickCreateIndex(null);
    setQuickCreateName('');
  };

  const clearNewProduct = (index: number) => {
    setNewOrder((current) => {
      const items = [...current.items];
      if (!items[index]) return current;
      items[index] = {
        productId: '',
        productName: '',
        specification: '',
        quantity: items[index].quantity,
        unitPrice: '',
      };
      return { ...current, items };
    });
  };

  const handleAddAllocation = (index: number) => {
    setNewOrder((current) => {
      const items = [...current.items];
      if (!items[index]) return current;
      const allocations = items[index].inboundAllocations || [];
      items[index] = { ...items[index], inboundAllocations: [...allocations, { employeeId: '', quantity: '' }] };
      return { ...current, items };
    });
  };

  const handleRemoveAllocation = (index: number, allocationIndex: number) => {
    setNewOrder((current) => {
      const items = [...current.items];
      if (!items[index]) return current;
      const allocations = (items[index].inboundAllocations || []).filter((_, ai) => ai !== allocationIndex);
      items[index] = { ...items[index], inboundAllocations: allocations };
      return { ...current, items };
    });
  };

  const handleAllocationChange = (
    index: number,
    allocationIndex: number,
    field: 'employeeId' | 'quantity',
    value: string,
  ) => {
    setNewOrder((current) => {
      const items = [...current.items];
      if (!items[index]) return current;
      const allocations = [...(items[index].inboundAllocations || [])];
      if (!allocations[allocationIndex]) return current;
      allocations[allocationIndex] = { ...allocations[allocationIndex], [field]: value };
      items[index] = { ...items[index], inboundAllocations: allocations };
      return { ...current, items };
    });
  };

  // 计算某行的库存缺口（新建产品按库存 0 计）。
  // 编辑态：后端会先把本单旧明细全额加回库存，故可用库存还要加上本单原来该产品的数量。
  const getItemShortfall = (item: DeliveryOrderFormItem) => {
    const isNew = Boolean(item.newProduct);
    if (!item.productId && !isNew) return 0;
    const quantity = Number(item.quantity) || 0;
    const stock = isNew ? 0 : Number(getProductById(item.productId)?.stock ?? 0);
    const reversedQty =
      isEditing && item.productId
        ? editOriginalItems
            .filter((original) => original.productId === item.productId)
            .reduce((sum, original) => sum + original.quantity, 0)
        : 0;
    const available = stock + reversedQty;
    return Math.max(0, Math.round((quantity - available) * 10000) / 10000);
  };

  const getAllocatedTotal = (item: DeliveryOrderFormItem) =>
    (item.inboundAllocations || []).reduce((sum, allocation) => sum + (Number(allocation.quantity) || 0), 0);

  const hasInsufficientAllocation = newOrder.items.some((item) => {
    const shortfall = getItemShortfall(item);
    return shortfall > 0 && getAllocatedTotal(item) < shortfall;
  });

  const handleEditOrder = (order: DeliveryOrder) => {
    setIsEditing(true);
    setEditingOrderId(order.id);
    setEditOriginalItems(order.items.map((item) => ({ productId: item.productId, quantity: Number(item.quantity) || 0 })));
    setNewOrder({
      customerId: order.customerId,
      deliveryDate: order.deliveryDate,
      items: order.items.map((item) => ({
        productId: item.productId,
        productName: item.product?.name || '',
        specification: item.product?.specification || '',
        quantity: item.quantity,
        unitPrice: formatEditableDecimal(item.unitPrice),
      })),
      remark: order.remark || '',
    });
    setShowAddModal(true);
  };

  const handleDeleteOrder = (order: DeliveryOrder) => {
    if (!window.confirm('确定要删除该送货单吗？')) return;
    deleteDeliveryMutation.mutate(order.id);
  };

  const handleOpenCompanyExport = (companyId: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setExportCompanyId(companyId);
  };

  const toggleCompanyExpand = (companyId: string) => {
    setExpandedCompanyIds((current) => {
      const next = new Set(current);
      if (next.has(companyId)) {
        next.delete(companyId);
      } else {
        next.add(companyId);
      }
      return next;
    });
  };

  const baseFilteredOrders = useMemo(() => {
    return (deliveryOrders || []).filter((order) => {
      const matchCustomer = filterCustomerId ? order.customerId === filterCustomerId : true;
      const matchDate =
        (filterDateRange.startDate ? order.deliveryDate >= filterDateRange.startDate : true) &&
        (filterDateRange.endDate ? order.deliveryDate <= filterDateRange.endDate : true);
      const matchKeyword = matchesKeyword(debouncedSearchTerm, [
        order.orderNumber,
        order.customer?.name,
        order.remark,
        ...(order.items || []).flatMap((item) => [item.product?.name, item.product?.specification]),
      ]);

      return matchCustomer && matchDate && matchKeyword;
    });
  }, [debouncedSearchTerm, deliveryOrders, filterCustomerId, filterDateRange.endDate, filterDateRange.startDate]);

  const groupedOrders = useMemo(() => {
    return groupDeliveryOrders(baseFilteredOrders, {
      itemFilter: (item) => {
        const matchProduct = filterProductName ? item.product?.name === filterProductName : true;
        const matchSpec = filterSpec ? item.product?.specification === filterSpec : true;
        return matchProduct && matchSpec;
      },
    });
  }, [baseFilteredOrders, filterProductName, filterSpec]);
  const filteredDeliveryOrderCount = useMemo(
    () => groupedOrders.reduce((sum, group) => sum + group.orderCount, 0),
    [groupedOrders],
  );

  const handleDateShortcut = (shortcut: DateRangeShortcut) => {
    setFilterDateRange(getDateRangeByShortcut(shortcut));
  };

  const clearFilters = () => {
    setFilterCustomerId('');
    setFilterDateRange({ startDate: '', endDate: '' });
    setFilterProductName('');
    setFilterSpec('');
    setSearchTerm('');
  };

  const activeFilters: ActiveFilter[] = [
    searchTerm
      ? {
          key: 'keyword',
          label: `关键词: ${searchTerm}`,
          onRemove: () => setSearchTerm(''),
        }
      : null,
    filterDateRange.startDate || filterDateRange.endDate
      ? {
          key: 'date',
          label: `日期: ${filterDateRange.startDate || '不限'} 至 ${filterDateRange.endDate || '不限'}`,
          onRemove: () => setFilterDateRange({ startDate: '', endDate: '' }),
        }
      : null,
    filterCustomerId
      ? {
          key: 'customer',
          label: `客户: ${customers?.find((customer) => customer.id === filterCustomerId)?.name || filterCustomerId}`,
          onRemove: () => setFilterCustomerId(''),
        }
      : null,
    filterProductName
      ? {
          key: 'product',
          label: `产品: ${filterProductName}`,
          onRemove: () => {
            setFilterProductName('');
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
  ].filter((item): item is ActiveFilter => Boolean(item));

  const printableCompany = useMemo(() => {
    if (!exportCompanyId) return null;

    const companyGroup = groupedOrders.find((item) => item.customerId === exportCompanyId);
    if (!companyGroup) return null;

    return {
      companyGroup,
      generatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    };
  }, [groupedOrders, exportCompanyId]);

  const handleDeliveryPdfExport = async (action: 'save' | 'share') => {
    if (!printableCompany || !printableCompanyRef.current) return;

    setIsExportingPdf(true);
    const filename = toSafePdfFileName(`送货单_${printableCompany.companyGroup.customerName}_${printableCompany.generatedAt}`);

    try {
      const result = await exportPrintable(
        printableCompanyRef.current,
        {
          filename,
          orientation: 'landscape',
          marginMm: 12,
          title: filename.replace(/\.pdf$/i, ''),
          text: `${printableCompany.companyGroup.customerName}的送货单`,
        },
        action,
      );

      if (result === 'fallback-download') {
        window.alert(getShareFallbackMessage());
      }
      if (result !== 'cancelled') {
        setExportCompanyId(null);
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
        .delivery-print-layout {
          display: none;
        }

        .delivery-slip {
          box-sizing: border-box;
        }

        .delivery-slip:not(:last-child) {
          page-break-after: always;
          break-after: page;
        }

        .delivery-slip-table {
          width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
        }

        .delivery-slip-table th,
        .delivery-slip-table td {
          border: 1px solid #111827;
          padding: 6px 8px;
          font-size: 13px;
          line-height: 1.4;
          box-sizing: border-box;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .delivery-slip-table thead {
          display: table-header-group;
        }

        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
          }

          body {
            background: #ffffff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          aside,
          .delivery-screen-controls,
          .delivery-screen-summary,
          .delivery-screen-layout,
          .delivery-modal-root {
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

          .delivery-page {
            padding: 0 !important;
          }

          .delivery-print-layout {
            display: block !important;
            width: 100% !important;
            padding: 0 !important;
            overflow: visible !important;
            box-sizing: border-box;
          }
        }
      `}</style>

      <PageHeader
        title="送货单管理"
        subtitle="按客户公司、日期和送货单逐层查看送货记录"
        action={{ label: '创建送货单', onClick: openCreateModal }}
      />

      <div className="delivery-page px-4 pb-4 pt-0 md:px-6 md:pb-6">
        <QueryStateBanner
          isLoading={isLoading}
          isError={Boolean(error)}
          loadingText="正在同步送货记录..."
          errorText="送货记录暂时无法同步，请确认后端服务已启动。"
          onRetry={() => refetch()}
        />
        <div className="-mx-4 overflow-hidden border-b border-line bg-white md:-mx-6">
          <div className="delivery-screen-controls">
            <FilterPanel
              totalCount={(deliveryOrders || []).length}
              filteredCount={filteredDeliveryOrderCount}
              activeFilters={activeFilters}
              onClear={clearFilters}
              primary={
                <>
                  <FilterField label="关键词" className="lg:w-64">
                    <SearchInput
                      value={searchTerm}
                      onChange={setSearchTerm}
                      placeholder="单号、客户、产品、备注"
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
                <>
                  <FilterField label="客户" className="lg:w-44">
                    <select
                      value={filterCustomerId}
                      onChange={(e) => setFilterCustomerId(e.target.value)}
                      className="block min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">所有客户</option>
                      {customers?.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                  </FilterField>

                  <FilterField label="产品名称" className="lg:w-44">
                    <select
                      value={filterProductName}
                      onChange={(e) => {
                        setFilterProductName(e.target.value);
                        setFilterSpec('');
                      }}
                      className="block min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">所有产品</option>
                      {productNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </FilterField>

                  <FilterField label="规格" className="lg:w-44">
                    <select
                      value={filterSpec}
                      onChange={(e) => setFilterSpec(e.target.value)}
                      className="block min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">所有规格</option>
                      {filterSpecOptions.map((specification) => (
                        <option key={specification} value={specification}>
                          {specification}
                        </option>
                      ))}
                    </select>
                  </FilterField>
                </>
              }
            />
          </div>

          <div className="delivery-screen-layout bg-canvas p-4 md:p-6">
            {!isLoading && groupedOrders.length === 0 ? (
              <ActionableEmptyState
                icon={Truck}
                title={(deliveryOrders || []).length ? '没有符合筛选条件的送货单' : '创建第一张送货单'}
                description={(deliveryOrders || []).length ? '当前筛选下没有送货记录，清除筛选后可查看全部客户送货情况。' : '送货单会带出客户价格并形成应收款，是后续对账和回款管理的基础。'}
                actionLabel={(deliveryOrders || []).length ? '清除筛选' : '创建送货单'}
                onAction={() => {
                  if ((deliveryOrders || []).length) {
                    clearFilters();
                    return;
                  }
                  openCreateModal();
                }}
              />
            ) : groupedOrders.length > 0 ? (
              <div className="space-y-4">
                {groupedOrders.map((companyGroup) => {
                  const isCompanyExpanded = expandedCompanyIds.has(companyGroup.customerId);

                  return (
                    <section
                      key={companyGroup.customerId}
                      className="overflow-hidden rounded-2xl border border-line bg-white shadow-card"
                    >
                      <EntityCardHeader
                        name={companyGroup.customerName}
                        initial={companyGroup.customerName.slice(0, 1) || '客'}
                        stats={[
                          { label: '送货单', value: String(companyGroup.orderCount) },
                          { label: '总货款', value: `¥${formatAmount(companyGroup.totalAmount)}` },
                        ]}
                        expanded={isCompanyExpanded}
                        onToggle={() => toggleCompanyExpand(companyGroup.customerId)}
                        onExport={(event) => handleOpenCompanyExport(companyGroup.customerId, event)}
                      />

                      <DisclosureSection open={isCompanyExpanded}>
                        <div className="space-y-5 border-t border-line bg-canvas px-3 py-4 sm:px-4">
                          {companyGroup.dates.map((dateGroup) => (
                            <div key={dateGroup.date} className="space-y-3">
                              <DateSectionHeader
                                date={dateGroup.date}
                                count={dateGroup.orderCount}
                                countLabel="单"
                                amount={dateGroup.totalAmount}
                                formatAmount={formatAmount}
                              />
                              {dateGroup.orders.map((orderGroup) => {
                                const returnedAmt = Number(orderGroup.order.returnedAmount ?? 0);
                                const originalAmt = Number(orderGroup.order.totalAmount);
                                const isFullyReturned = returnedAmt > 0 && returnedAmt >= originalAmt;
                                const isPartiallyReturned = returnedAmt > 0 && returnedAmt < originalAmt;

                                const statusBadge = isFullyReturned
                                  ? { label: '已退货', className: 'bg-rose-50 text-rose-600' }
                                  : isPartiallyReturned
                                    ? { label: '部分退货', className: 'bg-orange-50 text-orange-600' }
                                    : DELIVERY_STATUS_BADGES[orderGroup.order.status] ??
                                      DELIVERY_STATUS_BADGES[DeliveryOrderStatus.PENDING];

                                return (
                                  <article
                                    key={orderGroup.order.id}
                                    className="overflow-hidden rounded-xl border border-line bg-white"
                                  >
                                    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <h4 className="text-sm font-semibold text-ink">{orderGroup.order.orderNumber}</h4>
                                          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-600">
                                            {orderGroup.items.length} 项明细
                                          </span>
                                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge.className}`}>
                                            {statusBadge.label}
                                          </span>
                                        </div>
                                        {orderGroup.order.remark && (
                                          <p className="mt-1.5 text-xs text-ink-tertiary">备注：{orderGroup.order.remark}</p>
                                        )}
                                      </div>

                                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                                        <div className="text-right">
                                          <div className="text-xs text-ink-tertiary">本单金额</div>
                                          {isFullyReturned ? (
                                            <>
                                              <div className="text-base font-semibold tabular-nums text-rose-500">¥0</div>
                                              <div className="text-xs text-ink-tertiary line-through">原¥{formatAmountDetail(originalAmt)}</div>
                                            </>
                                          ) : isPartiallyReturned ? (
                                            <>
                                              <div className="text-base font-semibold tabular-nums text-ink">
                                                ¥{formatAmountDetail(originalAmt - returnedAmt)}
                                              </div>
                                              <div className="text-xs text-rose-400">已退¥{formatAmountDetail(returnedAmt)}</div>
                                            </>
                                          ) : (
                                            <div className="text-base font-semibold tabular-nums text-ink">
                                              ¥{formatAmountDetail(orderGroup.totalAmount)}
                                            </div>
                                          )}
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                          <button
                                            type="button"
                                            disabled={isFullyReturned || isPartiallyReturned}
                                            onClick={() => handleEditOrder(orderGroup.order)}
                                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-emerald-600 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-30"
                                            title={isFullyReturned || isPartiallyReturned ? '已退货订单不可编辑' : '编辑'}
                                          >
                                            <Edit className="h-4 w-4" />
                                          </button>
                                          <button
                                            type="button"
                                            disabled={isFullyReturned || isPartiallyReturned}
                                            onClick={() => handleDeleteOrder(orderGroup.order)}
                                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-rose-500 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-30"
                                            title={isFullyReturned || isPartiallyReturned ? '已退货订单不可删除' : '删除'}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </button>
                                        </div>
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
                                            {orderGroup.items.map((item, index) => (
                                              <tr
                                                key={item.id || `${orderGroup.order.id}-${index}`}
                                                className="transition-colors hover:bg-brand-50/40"
                                              >
                                                <td className="px-4 py-2.5 text-sm text-ink">
                                                  {[item.product?.name, item.product?.specification].filter(Boolean).join(' ') || '-'}
                                                </td>
                                                <td className="px-4 py-2.5 text-right text-sm tabular-nums text-ink">{item.quantity}</td>
                                                <td className="px-4 py-2.5 text-right text-sm tabular-nums text-ink">
                                                  {formatUnitPrice(item.unitPrice)}
                                                </td>
                                                <td className="px-4 py-2.5 text-right text-sm font-medium tabular-nums text-ink">
                                                  ¥{formatAmountDetail(item.amount)}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                      <div className="space-y-3 p-3 md:hidden">
                                        {orderGroup.items.map((item, index) => (
                                          <MobileRecordCard
                                            key={item.id || `${orderGroup.order.id}-${index}`}
                                            className="border-line-soft shadow-none"
                                          >
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
                                              <MobileField label="数量" value={`${item.quantity} ${item.product?.unit || ''}`} />
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
                      </DisclosureSection>
                    </section>
                  );
                })}
              </div>
            ) : null}
          </div>

          {printableCompany && (
            <ExportActionDialog
              title="导出送货单"
              description={`为 ${printableCompany.companyGroup.customerName} 生成 PDF 文件，可保存，或打开系统分享面板后选择微信。`}
              isProcessing={isExportingPdf}
              onSave={() => handleDeliveryPdfExport('save')}
              onShare={() => handleDeliveryPdfExport('share')}
              onClose={() => setExportCompanyId(null)}
            />
          )}

          {printableCompany && (
          <div ref={printableCompanyRef} className="delivery-print-layout">
            {printableCompany.companyGroup.dates
              .flatMap((dateGroup) => dateGroup.orders)
              .map((orderGroup) => {
                const [year, month, day] = (orderGroup.order.deliveryDate || '').split('-');
                const emptyRowCount = Math.max(0, DELIVERY_SLIP_MIN_ROWS - orderGroup.items.length);

                return (
                  <div key={orderGroup.order.id} className="delivery-slip bg-white px-7 py-6 text-gray-900">
                    <div className="relative pb-1">
                      <div className="text-center">
                        <h1 className="text-[26px] font-bold tracking-wide text-gray-900">
                          {company?.name || '　'}
                        </h1>
                        <p className="mt-1 text-[17px] font-semibold tracking-[0.5em] text-gray-900">送货单</p>
                      </div>
                      <div className="absolute right-0 top-1 text-[15px] font-bold tracking-wide text-red-600">
                        No. {orderGroup.order.orderNumber}
                      </div>
                    </div>

                    <div className="mt-2 flex items-end justify-between text-[13px] text-gray-900">
                      <span>收货单位：{printableCompany.companyGroup.customerName}</span>
                      <span>
                        {year || '　　'} 年 {month || '　'} 月 {day || '　'} 日
                      </span>
                    </div>

                    <table className="delivery-slip-table mt-2">
                      <colgroup>
                        <col style={{ width: '7%' }} />
                        <col style={{ width: '37%' }} />
                        <col style={{ width: '20%' }} />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '13%' }} />
                        <col style={{ width: '11%' }} />
                      </colgroup>
                      <thead>
                        <tr className="bg-gray-100 text-center font-semibold">
                          <th>序号</th>
                          <th>名称及规格</th>
                          <th>数量{unitLabel(orderGroup.items.map(i => i.product?.unit))}</th>
                          <th>单价</th>
                          <th>金额</th>
                          <th>备注</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderGroup.items.map((item, itemIndex) => (
                          <tr key={item.id || `${orderGroup.order.id}-${itemIndex}`}>
                            <td className="text-center">{itemIndex + 1}</td>
                            <td>
                              {item.product?.name || '-'}
                              {item.product?.specification ? `　${item.product.specification}` : ''}
                            </td>
                            <td className="text-right">{item.quantity}</td>
                            <td className="text-right">{formatUnitPrice(item.unitPrice)}</td>
                            <td className="text-right">{formatAmountDetail(item.amount)}</td>
                            <td></td>
                          </tr>
                        ))}
                        {Array.from({ length: emptyRowCount }).map((_, emptyIndex) => (
                          <tr key={`empty-${emptyIndex}`}>
                            <td>&nbsp;</td>
                            <td></td>
                            <td></td>
                            <td></td>
                            <td></td>
                            <td></td>
                            <td></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="font-semibold">
                          <td colSpan={5} className="text-left">
                            合计人民币（大写）：{numberToRmbCapital(orderGroup.totalAmount)}
                          </td>
                          <td className="text-right">¥{formatAmountDetail(orderGroup.totalAmount)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>

                    {orderGroup.order.remark ? (
                      <p className="mt-2 text-[12px] text-gray-700">备注：{orderGroup.order.remark}</p>
                    ) : null}

                    <div className="mt-3 text-[12px] text-gray-800">
                      <p>
                        地址：{company?.address || ''}
                        {'　　'}联系电话：{company?.phone || ''}
                      </p>
                      <div className="mt-3 flex justify-between pr-6">
                        <span>收货单位经手人：</span>
                        <span>送货单位经手人：</span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <div className="delivery-modal-root fixed inset-0 z-50 flex items-end justify-center bg-gray-600 bg-opacity-50 sm:items-center">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border bg-white p-5 shadow-lg sm:max-w-2xl sm:rounded-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">{isEditing ? '编辑送货单' : '创建送货单'}</h3>
              <button onClick={resetEditorState} className="text-gray-400 transition-colors hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {!isEditing && (
                <div className="rounded-lg border border-dashed border-brand-200 bg-brand-50/60 p-3">
                  <input
                    ref={recognizeInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) handleRecognizeImage(file);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => recognizeInputRef.current?.click()}
                    disabled={isRecognizing}
                    className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isRecognizing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        识别中...
                      </>
                    ) : (
                      <>
                        <Camera className="h-4 w-4" />
                        拍照 / 上传送货单图片识别
                      </>
                    )}
                  </button>
                  <p className="mt-2 text-center text-xs text-ink-tertiary">
                    自动识别客户、日期与商品明细并回填，<span className="font-medium text-amber-600">请务必核对后再提交</span>
                  </p>
                  {recognizeError && (
                    <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">{recognizeError}</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700">客户</label>
                <select
                  value={newOrder.customerId}
                  onChange={(e) => handleCustomerChange(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                >
                  <option value="">选择客户</option>
                  {customers?.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">送货日期</label>
                <DateField
                  value={newOrder.deliveryDate}
                  onChange={(value) => setNewOrder({ ...newOrder, deliveryDate: value })}
                  className="mt-1 w-full"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">商品列表</label>
                {newOrder.items.map((item, index) => {
                  const selectedProduct = getProductById(item.productId);
                  const isNewProduct = Boolean(item.newProduct);
                  const unitLabel = isNewProduct ? item.newProduct?.unit : selectedProduct?.unit;
                  const shortfall = getItemShortfall(item);
                  const allocatedTotal = getAllocatedTotal(item);
                  const allocations = item.inboundAllocations || [];
                  const showAllocation = shortfall > 0;

                  return (
                    <div key={index} className="mb-3 rounded-lg border border-gray-100 p-2">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_7rem_2.5rem] sm:items-end">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-700">产品名称 / 规格</label>
                          {isNewProduct ? (
                            <div className="flex min-h-[42px] items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
                              <span className="truncate text-blue-700">
                                新建：{item.newProduct?.name} - {item.newProduct?.specification}
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
                              value={item.productId}
                              onSelect={(productId) => handleItemChange(index, 'productId', productId)}
                              allowCreate
                              onCreateNew={(name) => openQuickCreate(index, name)}
                              placeholder="输入产品名称或规格"
                              className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                            />
                          )}
                          {!item.productId && item.productName ? (
                            <p className="mt-1 text-xs text-amber-600">
                              识别为：{item.productName}
                              {item.specification ? ` ${item.specification}` : ''}（请选择或新建产品）
                            </p>
                          ) : null}
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-700">
                            数量{unitLabel ? ` (${unitLabel})` : ''}
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={item.quantity === 0 || item.quantity === '0' ? '' : item.quantity}
                            placeholder="0"
                            onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                            onFocus={(e) => {
                              if (e.target.value === '0' || e.target.value === '') {
                                e.target.value = '';
                                handleItemChange(index, 'quantity', '');
                              }
                            }}
                            onBlur={(e) => {
                              if (e.target.value === '' || e.target.value === '0') {
                                handleItemChange(index, 'quantity', '0');
                              }
                            }}
                            className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-700">送货单价</label>
                          <input
                            type="number"
                            step="0.0001"
                            min="0"
                            value={item.unitPrice}
                            disabled={!isNewProduct && (!newOrder.customerId || !item.productId)}
                            onFocus={() => {
                              unitPriceFocusValueRef.current[index] = item.unitPrice;
                            }}
                            onBlur={(e) => {
                              const previousValue = unitPriceFocusValueRef.current[index];
                              const nextValue = e.target.value;
                              if (previousValue !== undefined && previousValue !== nextValue) {
                                if (!window.confirm('是否修改本次单价？')) {
                                  handleItemChange(index, 'unitPrice', previousValue);
                                }
                              }
                            }}
                            onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                            className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 disabled:bg-gray-100 sm:text-sm"
                          />
                        </div>

                        <div>
                          <button
                            onClick={() => handleRemoveItem(index)}
                            disabled={newOrder.items.length === 1}
                            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 py-2 text-red-600 transition-colors hover:bg-red-50 hover:text-red-900 disabled:cursor-not-allowed disabled:text-gray-300"
                            title="删除此商品"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </div>
                      </div>

                      {showAllocation && (
                        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-xs">
                            <span className="font-medium text-amber-800">
                              库存差 {formatDisplayDecimal(shortfall, 4)}
                              {unitLabel ? ` ${unitLabel}` : ''}
                            </span>
                            <span className={allocatedTotal >= shortfall ? 'text-emerald-700' : 'text-amber-800'}>
                              已分配 {formatDisplayDecimal(allocatedTotal, 4)}
                              {allocatedTotal > shortfall ? '（含富余）' : ''}
                            </span>
                          </div>

                          {allocations.map((allocation, allocationIndex) => (
                            <div key={allocationIndex} className="mb-2 grid grid-cols-[minmax(0,1fr)_5.5rem_2.25rem] gap-2">
                              <select
                                value={allocation.employeeId}
                                onChange={(e) => handleAllocationChange(index, allocationIndex, 'employeeId', e.target.value)}
                                className="block w-full rounded-md border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none"
                              >
                                <option value="">选择分配方式</option>
                                <option value={DIRECT_INBOUND}>直接入库（不计工资）</option>
                                {assignableEmployees.map((employee) => (
                                  <option key={employee.id} value={employee.id}>
                                    {employee.name}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={allocation.quantity}
                                placeholder="数量"
                                onChange={(e) => handleAllocationChange(index, allocationIndex, 'quantity', e.target.value)}
                                className="block w-full rounded-md border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveAllocation(index, allocationIndex)}
                                className="inline-flex items-center justify-center rounded-md text-red-600 transition-colors hover:bg-red-50"
                                title="移除分配"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}

                          <button
                            type="button"
                            onClick={() => handleAddAllocation(index)}
                            className="text-xs font-medium text-amber-800 hover:underline"
                          >
                            + 添加员工分配
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                <button
                  onClick={handleAddItem}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 sm:w-auto"
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  添加商品
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">备注</label>
                <textarea
                  value={newOrder.remark}
                  onChange={(e) => setNewOrder({ ...newOrder, remark: e.target.value })}
                  rows={3}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                ></textarea>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={resetEditorState}
                className="min-h-11 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleCreateOrUpdateOrder}
                disabled={hasInsufficientAllocation}
                title={hasInsufficientAllocation ? '存在库存缺口，请先把分配入库数量补足' : undefined}
                className="min-h-11 rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {isEditing ? '保存修改' : '创建送货单'}
              </button>
            </div>
          </div>
        </div>
      )}

      {quickCreateIndex !== null && (
        <QuickCreateProductForm
          initialName={quickCreateName}
          priceLabel="送货单价"
          onCancel={() => {
            setQuickCreateIndex(null);
            setQuickCreateName('');
          }}
          onConfirm={confirmQuickCreate}
        />
      )}
    </Layout>
  );
};

export default Delivery;
