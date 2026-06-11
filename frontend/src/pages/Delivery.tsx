import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Download, Edit, PlusCircle, Trash2, Truck, X } from 'lucide-react';
import ActionableEmptyState from '../components/ActionableEmptyState';
import DateField from '../components/DateField';
import ExportActionDialog from '../components/ExportActionDialog';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import ProductAutocomplete from '../components/ProductAutocomplete';
import QueryStateBanner from '../components/QueryStateBanner';
import { Customer, DeliveryOrder, Product } from '../types';
import { groupDeliveryOrders } from '../utils/deliveryGrouping';
import { formatAmount, formatEditableDecimal, formatUnitPrice } from '../utils/format';
import api from '../utils/api';
import { createPdfFileFromElement, downloadPdfFile, sharePdfFile, toSafePdfFileName } from '../utils/printShare';

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
};

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
  const [filterProductId, setFilterProductId] = useState('');
  const [filterSpec, setFilterSpec] = useState('');
  const [expandedCompanyIds, setExpandedCompanyIds] = useState<Set<string>>(new Set());
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());
  const [exportCompanyId, setExportCompanyId] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [newOrder, setNewOrder] = useState<DeliveryOrderForm>(createEmptyOrder());
  const printableCompanyRef = useRef<HTMLDivElement>(null);
  const unitPriceFocusValueRef = useRef<Record<number, string | number>>({});

  const queryClient = useQueryClient();

  const resetEditorState = () => {
    setShowAddModal(false);
    setIsEditing(false);
    setEditingOrderId(null);
    setNewOrder(createEmptyOrder());
    unitPriceFocusValueRef.current = {};
  };

  const openCreateModal = () => {
    setIsEditing(false);
    setEditingOrderId(null);
    setNewOrder(createEmptyOrder());
    setShowAddModal(true);
  };

  const { data: deliveryOrders, isLoading, error, refetch } = useQuery({
    queryKey: ['deliveryOrders'],
    queryFn: async () => {
      const response = await api.get('/delivery');
      return response.data as DeliveryOrder[];
    },
  });

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await api.get('/customers');
      return response.data.filter((customer: Customer) => customer.type === 'Client') as Customer[];
    },
  });

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const response = await api.get('/products');
      return response.data as Product[];
    },
  });
  const getProductById = (productId: string) => (products || []).find((product) => product.id === productId);

  const createDeliveryMutation = useMutation({
    mutationFn: async (order: DeliveryOrderForm) => {
      const payload = {
        ...order,
        items: order.items.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          unitPrice: item.unitPrice === '' ? undefined : Number(item.unitPrice),
        })),
      };
      const response = await api.post('/delivery', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliveryOrders'] });
      resetEditorState();
    },
  });

  const updateDeliveryMutation = useMutation({
    mutationFn: async ({ id, order }: { id: string; order: DeliveryOrderForm }) => {
      const payload = {
        ...order,
        items: order.items.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          unitPrice: item.unitPrice === '' ? undefined : Number(item.unitPrice),
        })),
      };
      const response = await api.put(`/delivery/${id}`, payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliveryOrders'] });
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
      };
    } else if (field === 'productName') {
      nextItems[index] = {
        ...nextItems[index],
        productName: value as string,
        specification: '',
        productId: '',
        unitPrice: '',
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

  const handleEditOrder = (order: DeliveryOrder) => {
    setIsEditing(true);
    setEditingOrderId(order.id);
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

  const toggleOrderExpand = (orderId: string) => {
    setExpandedOrderIds((current) => {
      const next = new Set(current);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
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

      return matchCustomer && matchDate;
    });
  }, [deliveryOrders, filterCustomerId, filterDateRange.endDate, filterDateRange.startDate]);

  const groupedOrders = useMemo(() => {
    return groupDeliveryOrders(baseFilteredOrders, {
      itemFilter: (item) => {
        const matchProduct = filterProductId ? item.productId === filterProductId : true;
        const matchSpec = filterSpec ? (item.product?.specification || '').includes(filterSpec) : true;
        return matchProduct && matchSpec;
      },
    });
  }, [baseFilteredOrders, filterProductId, filterSpec]);

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
      const file = await createPdfFileFromElement(printableCompanyRef.current, {
        filename,
        orientation: 'landscape',
        marginMm: 12,
      });

      if (action === 'save') {
        downloadPdfFile(file);
        setExportCompanyId(null);
        return;
      }

      const result = await sharePdfFile(file, {
        title: filename.replace(/\.pdf$/i, ''),
        text: `${printableCompany.companyGroup.customerName}的送货单`,
      });

      if (result === 'downloaded') {
        window.alert('当前浏览器无法直接分享到微信，已保存 PDF，可发送到微信。');
      }
      if (result !== 'cancelled') {
        setExportCompanyId(null);
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
        .delivery-print-layout {
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

          .delivery-print-card {
            border: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            width: 100% !important;
            box-sizing: border-box;
          }

          .delivery-print-shell,
          .delivery-print-table-shell {
            width: 100% !important;
            overflow: visible !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
            box-sizing: border-box;
          }

          .delivery-print-table {
            width: 100% !important;
            min-width: 0 !important;
            table-layout: fixed;
            font-size: 11px !important;
            box-sizing: border-box;
          }

          .delivery-print-table th,
          .delivery-print-table td {
            box-sizing: border-box;
            overflow-wrap: anywhere;
            word-break: break-word;
          }

          .delivery-print-table thead {
            display: table-header-group;
          }

          .delivery-print-table tr,
          .delivery-print-table td,
          .delivery-print-table th {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>

      <PageHeader
        title="送货单管理"
        subtitle="按客户公司、日期和送货单逐层查看送货记录"
        action={{ label: '创建送货单', onClick: openCreateModal }}
      />

      <div className="delivery-page p-8">
        <QueryStateBanner
          isLoading={isLoading}
          isError={Boolean(error)}
          loadingText="正在同步送货记录..."
          errorText="送货记录暂时无法同步，请确认后端服务已启动。"
          onRetry={() => refetch()}
        />
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="delivery-screen-controls border-b border-gray-200 bg-gray-50 p-4">
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

              <div className="pb-0.5">
                <button
                  onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    setFilterDateRange({ startDate: today, endDate: today });
                  }}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                >
                  今日
                </button>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">客户</label>
                <select
                  value={filterCustomerId}
                  onChange={(e) => setFilterCustomerId(e.target.value)}
                  className="block w-44 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">所有客户</option>
                  {customers?.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">产品名称</label>
                <select
                  value={filterProductId}
                  onChange={(e) => setFilterProductId(e.target.value)}
                  className="block w-44 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">所有产品</option>
                  {products?.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">规格</label>
                <select
                  value={filterSpec}
                  onChange={(e) => setFilterSpec(e.target.value)}
                  className="block w-44 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">所有规格</option>
                  {[...new Set(
                    (products || [])
                      .filter((product) => !filterProductId || product.id === filterProductId)
                      .map((product) => product.specification),
                  )].map((specification) => (
                    <option key={specification} value={specification}>
                      {specification}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ml-auto flex gap-2 pb-0.5">
                {(filterCustomerId || filterDateRange.startDate || filterDateRange.endDate || filterProductId || filterSpec) && (
                  <button
                    onClick={() => {
                      setFilterCustomerId('');
                      setFilterDateRange({ startDate: '', endDate: '' });
                      setFilterProductId('');
                      setFilterSpec('');
                    }}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-amber-700 transition-colors hover:bg-amber-50"
                  >
                    清除筛选
                  </button>
                )}

              </div>
            </div>
          </div>

          <div className="delivery-screen-layout p-6">
            {!isLoading && groupedOrders.length === 0 ? (
              <ActionableEmptyState
                icon={Truck}
                title={(deliveryOrders || []).length ? '没有符合筛选条件的送货单' : '创建第一张送货单'}
                description={(deliveryOrders || []).length ? '当前筛选下没有送货记录，清除筛选后可查看全部客户送货情况。' : '送货单会带出客户价格并形成应收款，是后续对账和回款管理的基础。'}
                actionLabel={(deliveryOrders || []).length ? '清除筛选' : '创建送货单'}
                onAction={() => {
                  if ((deliveryOrders || []).length) {
                    setFilterCustomerId('');
                    setFilterDateRange({ startDate: '', endDate: '' });
                    setFilterProductId('');
                    setFilterSpec('');
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
                    <section key={companyGroup.customerId} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                      <button
                        type="button"
                        onClick={() => toggleCompanyExpand(companyGroup.customerId)}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="text-gray-400">
                            {isCompanyExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-lg font-semibold text-gray-900">{companyGroup.customerName}</h3>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-6 text-right">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-gray-400">送货单数量</p>
                            <p className="mt-1 text-lg font-semibold text-gray-900">{companyGroup.orderCount}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-gray-400">总货款</p>
                            <p className="mt-1 text-lg font-semibold text-gray-900">¥{formatAmount(companyGroup.totalAmount)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={(event) => handleOpenCompanyExport(companyGroup.customerId, event)}
                            className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                            title="导出 PDF"
                          >
                            <Download className="mr-1 h-4 w-4" />
                            导出
                          </button>
                        </div>
                      </button>

                      {isCompanyExpanded && (
                        <div className="border-t border-gray-200 bg-gray-50/70 p-4">
                          <div className="space-y-3">
                            {companyGroup.dates.flatMap((dateGroup) =>
                              dateGroup.orders.map((orderGroup) => {
                                const isOrderExpanded = expandedOrderIds.has(orderGroup.order.id);

                                return (
                                  <div
                                    key={orderGroup.order.id}
                                    className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
                                  >
                                    <div
                                      className="flex cursor-pointer flex-col gap-4 px-4 py-4 transition-colors hover:bg-gray-50 lg:flex-row lg:items-start lg:justify-between"
                                      onClick={() => toggleOrderExpand(orderGroup.order.id)}
                                    >
                                      <div className="flex items-start gap-3">
                                        <div className="mt-0.5 text-gray-400">
                                          {isOrderExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                        </div>
                                        <div>
                                          <div className="flex flex-wrap items-center gap-3">
                                            <span className="text-sm font-medium text-gray-500">{dateGroup.date}</span>
                                            <h4 className="text-base font-semibold text-gray-900">{orderGroup.order.orderNumber}</h4>
                                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                                              {orderGroup.items.length} 项明细
                                            </span>
                                          </div>
                                          {orderGroup.order.remark && (
                                            <p className="mt-2 text-sm text-gray-500">备注：{orderGroup.order.remark}</p>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex flex-wrap items-start gap-3">
                                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-right">
                                          <div className="text-xs uppercase tracking-[0.18em] text-gray-400">本单金额</div>
                                          <div className="mt-1 text-lg font-semibold text-gray-900">
                                            ¥{formatAmount(orderGroup.totalAmount)}
                                          </div>
                                        </div>

                                        <div className="flex gap-2">
                                          <button
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              handleEditOrder(orderGroup.order);
                                            }}
                                            className="rounded-md border border-gray-300 p-2 text-emerald-700 transition-colors hover:bg-emerald-50"
                                            title="编辑"
                                          >
                                            <Edit className="h-4 w-4" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              handleDeleteOrder(orderGroup.order);
                                            }}
                                            className="rounded-md border border-gray-300 p-2 text-red-600 transition-colors hover:bg-red-50"
                                            title="删除"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </button>
                                        </div>
                                      </div>
                                    </div>

                                    {isOrderExpanded && (
                                      <div className="border-t border-gray-200 px-4 py-4">
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
                                              {orderGroup.items.map((item, index) => (
                                                <tr key={item.id || `${orderGroup.order.id}-${index}`} className="hover:bg-gray-50">
                                                  <td className="px-3 py-2 text-sm text-gray-900">{item.product?.name || '-'}</td>
                                                  <td className="px-3 py-2 text-sm text-gray-500">
                                                    {item.product?.specification || '-'}
                                                  </td>
                                                  <td className="px-3 py-2 text-right text-sm text-gray-900">{item.quantity}</td>
                                                  <td className="px-3 py-2 text-center text-sm text-gray-500">
                                                    {item.product?.unit || '-'}
                                                  </td>
                                                  <td className="px-3 py-2 text-right text-sm text-gray-900">
                                                    {formatUnitPrice(item.unitPrice)}
                                                  </td>
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
                          </div>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : null}
          </div>

          {printableCompany && (
            <ExportActionDialog
              title="导出送货单"
              description={`为 ${printableCompany.companyGroup.customerName} 保存 PDF，或在手机端分享到微信。`}
              isProcessing={isExportingPdf}
              onSave={() => handleDeliveryPdfExport('save')}
              onShare={() => handleDeliveryPdfExport('share')}
              onClose={() => setExportCompanyId(null)}
            />
          )}

          {printableCompany && (
          <div ref={printableCompanyRef} className="delivery-print-layout">
            <div className="delivery-print-card delivery-print-shell">
              <div className="flex items-end justify-between border-b border-gray-900 pb-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-gray-500">Kinko Delivery Report</p>
                  <h2 className="mt-2 text-[22px] font-semibold text-gray-900">送货单导出</h2>
                  <p className="mt-2 text-[12px] text-gray-700">
                    客户: {printableCompany.companyGroup.customerName}
                  </p>
                </div>
                <div className="text-right text-[12px] text-gray-700">
                  <p>生成时间: {printableCompany.generatedAt}</p>
                  <p>送货单数: {printableCompany.companyGroup.orderCount} 张</p>
                  <p>总货款: ¥{formatAmount(printableCompany.companyGroup.totalAmount)}</p>
                </div>
              </div>

              <div className="delivery-print-table-shell pt-4">
                <table className="delivery-print-table w-full border-collapse">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">日期</th>
                      <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">单号</th>
                      <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">产品名称</th>
                      <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">规格</th>
                      <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">数量</th>
                      <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">单位</th>
                      <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">单价</th>
                      <th className="border border-gray-900 px-2 py-3 text-center text-sm font-semibold text-gray-900">金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printableCompany.companyGroup.dates.flatMap((dateGroup) =>
                      dateGroup.orders.flatMap((orderGroup) =>
                        orderGroup.items.map((item, itemIndex) => (
                          <tr key={`${orderGroup.order.id}-${item.id || itemIndex}`}>
                            {itemIndex === 0 && (
                              <>
                                <td
                                  rowSpan={orderGroup.rowCount}
                                  className="border border-gray-900 px-2 py-3 align-top text-center text-sm text-gray-900"
                                >
                                  {dateGroup.date}
                                </td>
                                <td
                                  rowSpan={orderGroup.rowCount}
                                  className="border border-gray-900 px-2 py-3 align-top text-center text-sm font-semibold text-gray-900"
                                >
                                  {orderGroup.order.orderNumber}
                                </td>
                              </>
                            )}
                            <td className="border border-gray-900 px-3 py-3 text-sm text-gray-900">{item.product?.name || '-'}</td>
                            <td className="border border-gray-900 px-3 py-3 text-sm text-gray-700">
                              {item.product?.specification || '-'}
                            </td>
                            <td className="border border-gray-900 px-2 py-3 text-right text-sm text-gray-900">{item.quantity}</td>
                            <td className="border border-gray-900 px-2 py-3 text-center text-sm text-gray-700">
                              {item.product?.unit || '-'}
                            </td>
                            <td className="border border-gray-900 px-2 py-3 text-right text-sm text-gray-900">
                              {formatUnitPrice(item.unitPrice)}
                            </td>
                            <td className="border border-gray-900 px-2 py-3 text-right text-sm font-medium text-gray-900">
                              ¥{formatAmount(item.amount)}
                            </td>
                          </tr>
                        )),
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <div className="delivery-modal-root fixed inset-0 h-full w-full overflow-y-auto bg-gray-600 bg-opacity-50">
          <div className="relative top-20 mx-auto w-full max-w-2xl rounded-md border bg-white p-5 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">{isEditing ? '编辑送货单' : '创建送货单'}</h3>
              <button onClick={resetEditorState} className="text-gray-400 transition-colors hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
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

                  return (
                    <div key={index} className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_7rem_2.5rem] sm:items-end">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">产品名称 / 规格</label>
                        <ProductAutocomplete
                          products={products}
                          value={item.productId}
                          onSelect={(productId) => handleItemChange(index, 'productId', productId)}
                          placeholder="输入产品名称或规格"
                          className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          数量{selectedProduct?.unit ? ` (${selectedProduct.unit})` : ''}
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
                          disabled={!newOrder.customerId || !item.productId}
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
                          className="px-2 py-2 text-red-600 transition-colors hover:text-red-900 disabled:cursor-not-allowed disabled:text-gray-300"
                          title="删除此商品"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                <button
                  onClick={handleAddItem}
                  className="inline-flex items-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
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

            <div className="mt-6 flex justify-end">
              <button
                onClick={resetEditorState}
                className="mr-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleCreateOrUpdateOrder}
                className="rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                {isEditing ? '保存修改' : '创建送货单'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Delivery;
