import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit2, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import DateField from '../components/DateField';
import FilterPanel, { ActiveFilter, DateShortcutGroup, FilterField, SearchInput } from '../components/FilterPanel';
import ProductAutocomplete from '../components/ProductAutocomplete';
import DeliveryPicker from '../components/DeliveryPicker';
import ActionableEmptyState from '../components/ActionableEmptyState';
import DateSectionHeader from '../components/records/DateSectionHeader';
import { useCounterparties } from '../hooks/useCounterparties';
import useDebouncedValue from '../hooks/useDebouncedValue';
import {
  CustomerType,
  DeliveryOrder,
  Product,
  ProductType,
  ReturnOrder,
  User,
  UserRole,
} from '../types';
import api from '../utils/api';
import { formatAmount, formatAmountDetail, formatEditableDecimal, formatEditableQty, formatUnitPrice } from '../utils/format';
import { DateRangeShortcut, getDateRangeByShortcut, matchesKeyword } from '../utils/filtering';

type DeductionRow = {
  employeeId: string;
  quantity: string;
};

type ReturnItemForm = {
  productId: string;
  productName: string;
  quantity: string;
  unitPrice: string;
  restock: boolean;
  deduct: boolean;
  deductions: DeductionRow[];
};

const emptyDeduction = (): DeductionRow => ({ employeeId: '', quantity: '' });

const emptyItem = (): ReturnItemForm => ({
  productId: '',
  productName: '',
  quantity: '',
  unitPrice: '',
  restock: true,
  deduct: false,
  deductions: [emptyDeduction()],
});

const todayStr = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const groupByDate = (orders: ReturnOrder[]) => {
  const map = new Map<string, { date: string; orders: ReturnOrder[]; total: number }>();
  for (const order of orders) {
    const date = order.returnDate;
    const entry = map.get(date) || { date, orders: [], total: 0 };
    entry.orders.push(order);
    entry.total += Number(order.totalAmount || 0);
    map.set(date, entry);
  }
  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
};

const Returns = () => {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<ReturnOrder | null>(null);
  const [form, setForm] = useState({
    customerId: '',
    deliveryOrderId: '',
    returnDate: todayStr(),
    remark: '',
    items: [emptyItem()] as ReturnItemForm[],
  });
  const [submitError, setSubmitError] = useState('');

  // Filter state
  const [searchKey, setSearchKey] = useState('');
  const [filterDateRange, setFilterDateRange] = useState({ startDate: '', endDate: '' });
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const debouncedSearchKey = useDebouncedValue(searchKey);

  const { data: customers } = useCounterparties(CustomerType.CLIENT);
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get('/products')).data as Product[],
  });
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data as User[],
  });
  const { data: deliveryOrders } = useQuery({
    queryKey: ['deliveryOrders'],
    queryFn: async () => (await api.get('/delivery')).data as DeliveryOrder[],
  });
  const { data: returns, isLoading } = useQuery({
    queryKey: ['returnOrders'],
    queryFn: async () => (await api.get('/returns')).data as ReturnOrder[],
  });

  const finishedProducts = useMemo(
    () => (products || []).filter((product) => product.type === ProductType.FINISHED && product.isActive),
    [products],
  );
  const assignableEmployees = useMemo(
    () => (users || []).filter((user) => user.isActive && user.role === UserRole.PIECE_RATE),
    [users],
  );
  const customerDeliveries = useMemo(
    () => (deliveryOrders || []).filter((order) => order.customerId === form.customerId),
    [deliveryOrders, form.customerId],
  );

  const filtered = useMemo(() => {
    let list = returns || [];
    if (filterDateRange.startDate) list = list.filter((o) => o.returnDate >= filterDateRange.startDate);
    if (filterDateRange.endDate) list = list.filter((o) => o.returnDate <= filterDateRange.endDate);
    if (filterCustomerId) list = list.filter((o) => o.customerId === filterCustomerId);
    if (debouncedSearchKey) {
      list = list.filter((o) =>
        matchesKeyword(debouncedSearchKey, [
          o.returnNumber,
          o.customer?.name,
          ...(o.items || []).map((item) => item.product?.name),
        ]),
      );
    }
    return list;
  }, [returns, filterDateRange, filterCustomerId, debouncedSearchKey]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  const totalReturnAmount = useMemo(
    () =>
      form.items.reduce((sum, item) => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.unitPrice) || 0;
        return sum + qty * price;
      }, 0),
    [form.items],
  );

  const handleDateShortcut = (shortcut: DateRangeShortcut) => {
    setFilterDateRange(getDateRangeByShortcut(shortcut));
  };

  const clearFilters = () => {
    setSearchKey('');
    setFilterDateRange({ startDate: '', endDate: '' });
    setFilterCustomerId('');
  };

  const activeFilters: ActiveFilter[] = [
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
          label: `客户: ${customers?.find((c) => c.id === filterCustomerId)?.name || filterCustomerId}`,
          onRemove: () => setFilterCustomerId(''),
        }
      : null,
    searchKey
      ? {
          key: 'keyword',
          label: `关键词: ${searchKey}`,
          onRemove: () => setSearchKey(''),
        }
      : null,
  ].filter(Boolean) as ActiveFilter[];

  const invalidateAll = () => {
    ['returnOrders', 'deliveryOrders', 'products', 'salaryReport', 'inventoryRecords', 'reconciliation', 'customerStats', 'salesStats'].forEach(
      (key) => queryClient.invalidateQueries({ queryKey: [key] }),
    );
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        customerId: form.customerId,
        deliveryOrderId: form.deliveryOrderId || null,
        returnDate: form.returnDate,
        remark: form.remark,
        items: form.items
          .filter((item) => item.productId && Number(item.quantity) > 0)
          .map((item) => ({
            productId: item.productId,
            quantity: Number(item.quantity),
            unitPrice: item.unitPrice === '' ? undefined : Number(item.unitPrice),
            restock: item.restock,
            deductions: item.deduct
              ? item.deductions
                  .filter((d) => d.employeeId)
                  .map((d) => ({ employeeId: d.employeeId, quantity: Number(d.quantity || item.quantity) }))
              : [],
          })),
      };
      return (await api.post('/returns', payload)).data;
    },
    onSuccess: () => {
      invalidateAll();
      closeModal();
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message || '创建退货单失败';
      setSubmitError(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (id: string) => {
      const payload = {
        customerId: form.customerId,
        deliveryOrderId: form.deliveryOrderId || null,
        returnDate: form.returnDate,
        remark: form.remark,
        items: form.items
          .filter((item) => item.productId && Number(item.quantity) > 0)
          .map((item) => ({
            productId: item.productId,
            quantity: Number(item.quantity),
            unitPrice: item.unitPrice === '' ? undefined : Number(item.unitPrice),
            restock: item.restock,
            deductions: item.deduct
              ? item.deductions
                  .filter((d) => d.employeeId)
                  .map((d) => ({ employeeId: d.employeeId, quantity: Number(d.quantity || item.quantity) }))
              : [],
          })),
      };
      return (await api.put(`/returns/${id}`, payload)).data;
    },
    onSuccess: () => {
      invalidateAll();
      closeModal();
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message || '更新退货单失败';
      setSubmitError(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/returns/${id}`)).data,
    onSuccess: invalidateAll,
  });

  const openModal = () => {
    setEditingOrder(null);
    setForm({ customerId: '', deliveryOrderId: '', returnDate: todayStr(), remark: '', items: [emptyItem()] });
    setSubmitError('');
    setShowModal(true);
  };

  const openEditModal = (order: ReturnOrder) => {
    setEditingOrder(order);
    const orderDeductions = order.deductions || [];
    setForm({
      customerId: order.customerId,
      deliveryOrderId: order.deliveryOrderId || '',
      returnDate: order.returnDate,
      remark: order.remark || '',
      items: order.items.map((item) => {
        const productName = item.product?.name;
        const matchingDeductions = productName
          ? orderDeductions.filter((d) => d.reason === `退货扣款 ${order.returnNumber} · ${productName}`)
          : [];
        const hasDeduction = matchingDeductions.length > 0 || (item.deductionCount ?? 0) > 0 || !!item.deductEmployeeId;
        const deductions: DeductionRow[] =
          matchingDeductions.length > 0
            ? matchingDeductions.map((d) => ({
                employeeId: d.employeeId,
                quantity: formatEditableQty(d.quantity ?? 0),
              }))
            : item.deductEmployeeId
              ? [{ employeeId: item.deductEmployeeId, quantity: formatEditableQty(item.deductQuantity) }]
              : [emptyDeduction()];
        return {
          productId: item.productId,
          productName: item.product
            ? `${item.product.name}${item.product.specification ? ` ${item.product.specification}` : ''}`
            : '',
          quantity: formatEditableQty(item.quantity),
          unitPrice: formatEditableDecimal(item.unitPrice),
          restock: item.restock,
          deduct: hasDeduction,
          deductions,
        };
      }),
    });
    setSubmitError('');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingOrder(null);
    setSubmitError('');
  };

  const updateItem = (index: number, patch: Partial<ReturnItemForm>) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, idx) => (idx === index ? { ...item, ...patch } : item)),
    }));
  };

  const updateDeduction = (itemIndex: number, dIndex: number, patch: Partial<DeductionRow>) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, idx) =>
        idx === itemIndex
          ? {
              ...item,
              deductions: item.deductions.map((d, di) => (di === dIndex ? { ...d, ...patch } : d)),
            }
          : item,
      ),
    }));
  };

  const addDeduction = (itemIndex: number) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, idx) =>
        idx === itemIndex ? { ...item, deductions: [...item.deductions, emptyDeduction()] } : item,
      ),
    }));
  };

  const removeDeduction = (itemIndex: number, dIndex: number) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, idx) =>
        idx === itemIndex
          ? { ...item, deductions: item.deductions.filter((_, di) => di !== dIndex) }
          : item,
      ),
    }));
  };

  const returnedDeliveryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const ret of returns || []) {
      if (ret.deliveryOrderId && ret.id !== editingOrder?.id) ids.add(ret.deliveryOrderId);
    }
    return ids;
  }, [returns, editingOrder]);

  const handleSelectProduct = (index: number, productId: string) => {
    const product = finishedProducts.find((item) => item.id === productId);
    updateItem(index, {
      productId,
      productName: product ? `${product.name}${product.specification ? ` ${product.specification}` : ''}` : '',
      unitPrice: product ? formatEditableDecimal(product.basePrice ?? 0) : '',
    });
  };

  const handleSelectDelivery = (deliveryOrderId: string) => {
    const order = (deliveryOrders || []).find((item) => item.id === deliveryOrderId);
    if (!order) {
      setForm((current) => ({ ...current, deliveryOrderId, items: [emptyItem()] }));
      return;
    }
    const items: ReturnItemForm[] = order.items.map((line) => ({
      productId: line.productId,
      productName: line.product
        ? `${line.product.name}${line.product.specification ? ` ${line.product.specification}` : ''}`
        : '',
      quantity: formatEditableQty(line.quantity),
      unitPrice: formatEditableDecimal(line.unitPrice),
      restock: true,
      deduct: false,
      deductions: [emptyDeduction()],
    }));
    setForm((current) => ({ ...current, deliveryOrderId, items: items.length ? items : [emptyItem()] }));
  };

  const canSubmit =
    Boolean(form.customerId) && form.items.some((item) => item.productId && Number(item.quantity) > 0);

  const handleSubmit = () => {
    setSubmitError('');
    if (!canSubmit) {
      setSubmitError('请选择客户并至少填写一条有效退货明细');
      return;
    }
    if (form.items.some((item) => item.deduct && !item.deductions.some((d) => d.employeeId))) {
      setSubmitError('勾选「质量问题扣工资」的明细必须至少选择一位员工');
      return;
    }
    if (editingOrder) {
      updateMutation.mutate(editingOrder.id);
    } else {
      createMutation.mutate();
    }
  };

  return (
    <Layout>
      <PageHeader title="退货管理" action={{ label: '新增退货', onClick: openModal }} />

      <FilterPanel
        totalCount={(returns || []).length}
        filteredCount={filtered.length}
        activeFilters={activeFilters}
        onClear={clearFilters}
        resultLabel="退货单"
        primary={
          <>
            <FilterField label="关键词" className="lg:w-64">
              <SearchInput
                value={searchKey}
                onChange={setSearchKey}
                placeholder="单号 / 客户 / 产品"
              />
            </FilterField>
            <FilterField label="开始日期" className="lg:w-40">
              <DateField
                value={filterDateRange.startDate}
                onChange={(value) => setFilterDateRange((r) => ({ ...r, startDate: value }))}
                className="w-full"
              />
            </FilterField>
            <FilterField label="结束日期" className="lg:w-40">
              <DateField
                value={filterDateRange.endDate}
                onChange={(value) => setFilterDateRange((r) => ({ ...r, endDate: value }))}
                className="w-full"
              />
            </FilterField>
            <FilterField label="快捷日期" className="sm:col-span-2 lg:w-72">
              <DateShortcutGroup onSelect={handleDateShortcut} />
            </FilterField>
          </>
        }
        advanced={
          <FilterField label="客户" className="lg:w-44">
            <select
              value={filterCustomerId}
              onChange={(e) => setFilterCustomerId(e.target.value)}
              className="block min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">所有客户</option>
              {(customers || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </FilterField>
        }
      />

      <div className="bg-canvas px-4 py-4 md:px-6">
        {isLoading ? (
          <div className="p-8 text-center text-ink-tertiary">加载中...</div>
        ) : (returns || []).length === 0 ? (
          <ActionableEmptyState
            icon={RotateCcw}
            title="暂无退货记录"
            description="客户退货会冲减应收、按需回退库存，并可扣减对应员工的计件工资。"
            actionLabel="新增退货"
            onAction={openModal}
          />
        ) : grouped.length === 0 ? (
          <div className="rounded-xl border border-line bg-white p-8 text-center text-sm text-ink-tertiary">
            没有符合筛选条件的退货单
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => (
              <section key={group.date}>
                <DateSectionHeader
                  date={group.date}
                  count={group.orders.length}
                  countLabel="单"
                  amount={group.total}
                  formatAmount={formatAmount}
                />
                <div className="mt-3 space-y-3">
                  {group.orders.map((order) => (
                    <article
                      key={order.id}
                      className="overflow-hidden rounded-xl border border-line bg-white shadow-sm"
                    >
                      {/* Card header */}
                      <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-200/60">
                            {order.customer?.name || '未知客户'}
                          </span>
                          <span className="text-sm font-medium text-ink-secondary">{order.returnNumber}</span>
                          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-600">
                            退货 −¥{formatAmountDetail(order.totalAmount)}
                          </span>
                          {order.deliveryOrderId && (
                            <span className="rounded-full bg-slate-50 px-2 py-0.5 text-xs text-ink-tertiary">
                              关联送货单
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(order)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-emerald-600 transition-colors hover:bg-emerald-50"
                            title="编辑"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm('删除退货单将回退库存与工资扣减，确定删除吗？')) {
                                deleteMutation.mutate(order.id);
                              }
                            }}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-rose-500 transition-colors hover:bg-rose-50"
                            title="删除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Items table — desktop */}
                      <div className="hidden overflow-x-auto border-t border-line-soft md:block">
                        <table className="min-w-full">
                          <thead>
                            <tr className="border-b border-line bg-canvas text-ink-tertiary">
                              <th className="px-4 py-2.5 text-left text-xs font-medium">产品</th>
                              <th className="px-4 py-2.5 text-right text-xs font-medium">数量</th>
                              <th className="px-4 py-2.5 text-right text-xs font-medium">单价</th>
                              <th className="px-4 py-2.5 text-right text-xs font-medium">金额</th>
                              <th className="px-4 py-2.5 text-center text-xs font-medium">库存</th>
                              <th className="px-4 py-2.5 text-left text-xs font-medium">扣工资</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line-soft">
                            {order.items.map((item) => (
                              <tr key={item.id} className="transition-colors hover:bg-brand-50/40">
                                <td className="px-4 py-2.5 text-sm text-ink">{item.product?.name || '-'}</td>
                                <td className="px-4 py-2.5 text-right text-sm tabular-nums text-ink">{item.quantity}</td>
                                <td className="px-4 py-2.5 text-right text-sm tabular-nums text-ink">{formatUnitPrice(item.unitPrice)}</td>
                                <td className="px-4 py-2.5 text-right text-sm font-medium tabular-nums text-ink">¥{formatAmountDetail(item.amount)}</td>
                                <td className="px-4 py-2.5 text-center text-xs">
                                  {item.restock ? (
                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">回库</span>
                                  ) : (
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">报废</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-xs text-ink-secondary">
                                  {(item.deductionCount || (item.deductEmployeeId ? 1 : 0)) > 0
                                    ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-600">扣 {item.deductionCount || 1} 人</span>
                                    : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Items — mobile */}
                      <div className="space-y-2 border-t border-line-soft p-3 md:hidden">
                        {order.items.map((item) => (
                          <div key={item.id} className="rounded-lg border border-line-soft p-3">
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-sm font-medium text-ink">{item.product?.name || '-'}</span>
                              <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">¥{formatAmountDetail(item.amount)}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-secondary">
                              <span className="tabular-nums">数量 {item.quantity} × {formatUnitPrice(item.unitPrice)}</span>
                              {item.restock ? (
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">回库</span>
                              ) : (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">报废</span>
                              )}
                              <span>{(item.deductionCount || (item.deductEmployeeId ? 1 : 0)) > 0 ? `扣工资 ${item.deductionCount || 1} 人` : '不扣工资'}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Salary deductions */}
                      {(order.deductions || []).length > 0 && (
                        <div className="border-t border-rose-100 bg-rose-50/20 px-4 py-3">
                          <div className="mb-2.5 flex items-center justify-between">
                            <span className="text-xs font-semibold tracking-wide text-rose-500">工资扣减明细</span>
                            <span className="text-xs font-semibold tabular-nums text-rose-400">
                              合计 −¥{(order.deductions || []).reduce((s, d) => s + Number(d.amount || 0), 0).toFixed(2)}
                            </span>
                          </div>
                          <div className="divide-y divide-rose-100/70 overflow-hidden rounded-lg border border-rose-100/80 bg-white/60">
                            {(order.deductions || []).map((d) => {
                              const productName = d.reason?.includes(' · ')
                                ? d.reason.split(' · ').slice(1).join(' · ')
                                : null;
                              const hasDetail = d.quantity != null && d.unitPrice != null;
                              const priceStr = hasDetail
                                ? Number(d.unitPrice).toFixed(4).replace(/\.?0+$/, '')
                                : null;
                              return (
                                <div key={d.id} className="flex items-center gap-2.5 px-3 py-2">
                                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-[10px] font-bold text-rose-600">
                                    {(d.employee?.name ?? '?').slice(0, 1)}
                                  </div>
                                  <span className="shrink-0 text-sm font-medium text-ink">{d.employee?.name ?? '—'}</span>
                                  {productName && (
                                    <span className="shrink-0 rounded bg-rose-100/80 px-1.5 py-0.5 text-[10px] font-medium text-rose-500">{productName}</span>
                                  )}
                                  {hasDetail && (
                                    <span className="shrink-0 text-xs tabular-nums text-ink-tertiary">
                                      {Number(d.quantity)} 件 × ¥{priceStr}
                                    </span>
                                  )}
                                  <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums text-rose-500">
                                    −¥{Number(d.amount).toFixed(2)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {order.remark && (
                        <div className="border-t border-line-soft px-4 py-2 text-xs text-ink-tertiary">备注：{order.remark}</div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-4">
          <div className="my-8 w-full max-w-3xl rounded-2xl bg-white p-5 shadow-pop md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-ink">{editingOrder ? `编辑退货单 ${editingOrder.returnNumber}` : '新增退货'}</h3>
              <button type="button" onClick={closeModal} className="text-ink-tertiary transition-colors hover:text-ink">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-ink-secondary">客户</label>
                  <select
                    value={form.customerId}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, customerId: event.target.value, deliveryOrderId: '', items: [emptyItem()] }))
                    }
                    className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="">选择客户</option>
                    {(customers || []).map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-secondary">关联送货单（可选）</label>
                  <div className="mt-1">
                    <DeliveryPicker
                      deliveries={customerDeliveries}
                      value={form.deliveryOrderId}
                      onSelect={handleSelectDelivery}
                      disabled={!form.customerId}
                      returnedIds={returnedDeliveryIds}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-secondary">退货日期</label>
                  <DateField
                    value={form.returnDate}
                    onChange={(value) => setForm((current) => ({ ...current, returnDate: value }))}
                    className="mt-1 w-full"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink-secondary">退货明细</span>
                  <button
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, items: [...current.items, emptyItem()] }))}
                    className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs text-ink-secondary transition-colors hover:bg-canvas"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    添加明细
                  </button>
                </div>

                {form.items.map((item, index) => {
                  const itemCostPrice = finishedProducts.find((p) => p.id === item.productId)?.costPrice;
                  return (
                  <div key={index} className="rounded-xl border border-line bg-canvas p-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_90px_110px]">
                      <div>
                        <label className="mb-1 block text-xs text-ink-tertiary">产品</label>
                        <ProductAutocomplete
                          products={finishedProducts}
                          value={item.productId}
                          onSelect={(productId) => handleSelectProduct(index, productId)}
                          placeholder="选择成品"
                          className="block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-ink-tertiary">退货数量</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={item.quantity}
                          onChange={(event) => updateItem(index, { quantity: event.target.value.replace(/。/g, '.') })}
                          className="block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-ink-tertiary">客户单价</label>
                        {form.deliveryOrderId ? (
                          <div className="flex min-h-10 items-center rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-secondary">
                            {item.unitPrice ? `¥${item.unitPrice}` : '—'}
                          </div>
                        ) : (
                          <input
                            type="text"
                            inputMode="decimal"
                            value={item.unitPrice}
                            onChange={(event) => updateItem(index, { unitPrice: event.target.value.replace(/。/g, '.') })}
                            className="block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
                          />
                        )}
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-4">
                      <label className="inline-flex items-center gap-1.5 text-sm text-ink-secondary">
                        <input
                          type="checkbox"
                          checked={item.restock}
                          onChange={(event) => updateItem(index, { restock: event.target.checked })}
                          className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-500"
                        />
                        回成品库存（不勾=报废）
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-sm text-ink-secondary">
                        <input
                          type="checkbox"
                          checked={item.deduct}
                          onChange={(event) => updateItem(index, { deduct: event.target.checked })}
                          className="h-4 w-4 rounded border-line text-rose-600 focus:ring-rose-500"
                        />
                        质量问题→扣工资
                      </label>
                      {form.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setForm((current) => ({ ...current, items: current.items.filter((_, idx) => idx !== index) }))}
                          className="ml-auto inline-flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          移除
                        </button>
                      )}
                    </div>

                    {item.deduct && (
                      <div className="mt-2 space-y-2 rounded-lg border border-rose-100 bg-rose-50/60 p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-rose-600">
                            扣工资明细（数量 × 成本价{itemCostPrice ? ` ¥${formatUnitPrice(Number(itemCostPrice))}` : ''}）
                          </span>
                          <button
                            type="button"
                            onClick={() => addDeduction(index)}
                            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-rose-600 hover:bg-rose-100"
                          >
                            <Plus className="h-3 w-3" />
                            添加员工
                          </button>
                        </div>
                        {item.deductions.map((d, dIdx) => {
                          const otherUsed = item.deductions.reduce(
                            (s, d2, i2) => (i2 !== dIdx ? s + (Number(d2.quantity) || 0) : s),
                            0,
                          );
                          const itemTotal = Number(item.quantity);
                          const deductMax = itemTotal > 0 ? Math.max(0, itemTotal - otherUsed) : undefined;
                          const costPrice = itemCostPrice ? Number(itemCostPrice) : 0;
                          const deductAmount = costPrice > 0 && Number(d.quantity) > 0
                            ? Math.round(Number(d.quantity) * costPrice * 100) / 100
                            : null;
                          return (
                          <div key={dIdx} className="grid grid-cols-[1fr_80px_80px_90px_auto] items-end gap-2">
                            <div>
                              <label className="mb-1 block text-xs text-ink-tertiary">员工</label>
                              <select
                                value={d.employeeId}
                                onChange={(e) => updateDeduction(index, dIdx, { employeeId: e.target.value })}
                                className="block min-h-9 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink focus:border-brand-500 focus:outline-none"
                              >
                                <option value="">选择员工</option>
                                {assignableEmployees.map((emp) => (
                                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs text-ink-tertiary">
                                扣件数量
                                {deductMax !== undefined && (
                                  <span className="ml-1 text-ink-quaternary">≤{formatEditableQty(deductMax)}</span>
                                )}
                              </label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={d.quantity}
                                placeholder={item.quantity || '0'}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/。/g, '.');
                                  if (deductMax !== undefined && Number(raw) > deductMax) {
                                    updateDeduction(index, dIdx, { quantity: String(deductMax) });
                                  } else {
                                    updateDeduction(index, dIdx, { quantity: raw });
                                  }
                                }}
                                className="block w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink focus:border-brand-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs text-ink-tertiary">入库单价</label>
                              <div className="flex min-h-9 items-center rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink-secondary">
                                {costPrice > 0 ? `¥${formatUnitPrice(costPrice)}` : '—'}
                              </div>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs text-ink-tertiary">扣款工资</label>
                              <div className="flex min-h-9 items-center rounded-lg border border-line bg-surface px-2 py-1.5 text-sm font-medium text-rose-600">
                                {deductAmount !== null ? `¥${deductAmount.toFixed(2)}` : '—'}
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={item.deductions.length <= 1}
                              onClick={() => removeDeduction(index, dIdx)}
                              className="mb-0.5 flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-rose-400 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>

              <div>
                <label className="block text-sm font-medium text-ink-secondary">备注</label>
                <textarea
                  value={form.remark}
                  onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))}
                  rows={2}
                  className="mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-rose-100 bg-rose-50/60 px-4 py-3">
                <span className="text-xs uppercase tracking-wider text-rose-500">退货总额（冲减应收）</span>
                <span className="text-lg font-semibold tabular-nums text-rose-600">−¥{formatAmount(totalReturnAmount)}</span>
              </div>

              {submitError && <p className="text-sm text-rose-600">{submitError}</p>}
            </div>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeModal}
                className="min-h-11 rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-canvas"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || createMutation.isPending || updateMutation.isPending}
                className="min-h-11 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {(createMutation.isPending || updateMutation.isPending)
                  ? '提交中...'
                  : editingOrder ? '保存更改' : '创建退货单'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Returns;
