import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RotateCcw, Trash2, X } from 'lucide-react';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import DateField from '../components/DateField';
import ProductAutocomplete from '../components/ProductAutocomplete';
import DeliveryPicker from '../components/DeliveryPicker';
import ActionableEmptyState from '../components/ActionableEmptyState';
import EntityCardHeader from '../components/records/EntityCardHeader';
import DisclosureSection from '../components/records/DisclosureSection';
import DateSectionHeader from '../components/records/DateSectionHeader';
import { useCounterparties } from '../hooks/useCounterparties';
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
import { formatAmount, formatAmountDetail, formatEditableDecimal, formatUnitPrice } from '../utils/format';

type ReturnItemForm = {
  productId: string;
  productName: string;
  quantity: string;
  unitPrice: string;
  restock: boolean;
  deduct: boolean;
  deductEmployeeId: string;
  deductQuantity: string;
};

const emptyItem = (): ReturnItemForm => ({
  productId: '',
  productName: '',
  quantity: '',
  unitPrice: '',
  restock: true,
  deduct: false,
  deductEmployeeId: '',
  deductQuantity: '',
});

const todayStr = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const groupByCustomer = (orders: ReturnOrder[]) => {
  const map = new Map<string, { name: string; orders: ReturnOrder[]; total: number }>();
  for (const order of orders) {
    const id = order.customerId;
    const name = order.customer?.name || '未命名客户';
    const entry = map.get(id) || { name, orders: [], total: 0 };
    entry.orders.push(order);
    entry.total += Number(order.totalAmount || 0);
    map.set(id, entry);
  }
  return Array.from(map.entries()).map(([id, value]) => ({ id, ...value }));
};

const Returns = () => {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    customerId: '',
    deliveryOrderId: '',
    returnDate: todayStr(),
    remark: '',
    items: [emptyItem()] as ReturnItemForm[],
  });
  const [submitError, setSubmitError] = useState('');

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
  const grouped = useMemo(() => groupByCustomer(returns || []), [returns]);

  const totalReturnAmount = useMemo(
    () =>
      form.items.reduce((sum, item) => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.unitPrice) || 0;
        return sum + qty * price;
      }, 0),
    [form.items],
  );

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
            deductEmployeeId: item.deduct && item.deductEmployeeId ? item.deductEmployeeId : null,
            deductQuantity:
              item.deduct && item.deductEmployeeId ? Number(item.deductQuantity || item.quantity) : undefined,
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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/returns/${id}`)).data,
    onSuccess: invalidateAll,
  });

  const openModal = () => {
    setForm({ customerId: '', deliveryOrderId: '', returnDate: todayStr(), remark: '', items: [emptyItem()] });
    setSubmitError('');
    setShowModal(true);
  };
  const closeModal = () => {
    setShowModal(false);
    setSubmitError('');
  };

  const toggleExpand = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateItem = (index: number, patch: Partial<ReturnItemForm>) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, idx) => (idx === index ? { ...item, ...patch } : item)),
    }));
  };

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
      quantity: formatEditableDecimal(line.quantity),
      unitPrice: formatEditableDecimal(line.unitPrice),
      restock: true,
      deduct: false,
      deductEmployeeId: '',
      deductQuantity: '',
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
    if (form.items.some((item) => item.deduct && !item.deductEmployeeId)) {
      setSubmitError('勾选「质量问题扣工资」的明细必须选择员工');
      return;
    }
    createMutation.mutate();
  };

  return (
    <Layout>
      <PageHeader title="退货管理" action={{ label: '新增退货', onClick: openModal }} />

      <div className="bg-canvas px-4 py-4 md:px-6">
        {isLoading ? (
          <div className="p-8 text-center text-ink-tertiary">加载中...</div>
        ) : grouped.length === 0 ? (
          <ActionableEmptyState
            icon={RotateCcw}
            title="暂无退货记录"
            description="客户退货会冲减应收、按需回退库存，并可扣减对应员工的计件工资。"
            actionLabel="新增退货"
            onAction={openModal}
          />
        ) : (
          <div className="space-y-4">
            {grouped.map((group) => {
              const isOpen = expanded.has(group.id);
              return (
                <section
                  key={group.id}
                  className="overflow-hidden rounded-2xl border border-line bg-white shadow-card"
                >
                  <EntityCardHeader
                    name={group.name}
                    initial={group.name.slice(0, 1) || '客'}
                    stats={[
                      { label: '退货单', value: String(group.orders.length) },
                      { label: '退货总额', value: `¥${formatAmount(group.total)}` },
                    ]}
                    expanded={isOpen}
                    onToggle={() => toggleExpand(group.id)}
                    onExport={() => toggleExpand(group.id)}
                    exportLabel="展开"
                  />
                  <DisclosureSection open={isOpen}>
                    <div className="space-y-5 border-t border-line bg-canvas px-3 py-4 sm:px-4">
                      {group.orders.map((order) => (
                        <div key={order.id} className="space-y-3">
                          <DateSectionHeader
                            date={order.returnDate}
                            count={order.items.length}
                            countLabel="项"
                            amount={Number(order.totalAmount)}
                            formatAmount={formatAmount}
                          />
                          <article className="overflow-hidden rounded-xl border border-line bg-white">
                            <div className="flex items-center justify-between gap-3 px-4 py-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-sm font-semibold text-ink">{order.returnNumber}</h4>
                                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-600">
                                  退货 −¥{formatAmountDetail(order.totalAmount)}
                                </span>
                              </div>
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
                                        {item.deductEmployeeId ? `扣 ${item.deductQuantity}` : '—'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

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
                                    <span>{item.deductEmployeeId ? `扣工资 ${item.deductQuantity}` : '不扣工资'}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                            {order.remark && (
                              <div className="border-t border-line-soft px-4 py-2 text-xs text-ink-tertiary">备注：{order.remark}</div>
                            )}
                          </article>
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

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-4">
          <div className="my-8 w-full max-w-3xl rounded-2xl bg-white p-5 shadow-pop md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-ink">新增退货</h3>
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

                {form.items.map((item, index) => (
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
                          type="number"
                          step="0.0001"
                          value={item.quantity}
                          onChange={(event) => updateItem(index, { quantity: event.target.value })}
                          className="block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-ink-tertiary">单价</label>
                        <input
                          type="number"
                          step="0.0001"
                          value={item.unitPrice}
                          onChange={(event) => updateItem(index, { unitPrice: event.target.value })}
                          className="block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
                        />
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
                      <div className="mt-2 grid grid-cols-1 gap-3 rounded-lg border border-rose-100 bg-rose-50/60 p-2.5 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs text-ink-tertiary">扣工资员工</label>
                          <select
                            value={item.deductEmployeeId}
                            onChange={(event) => updateItem(index, { deductEmployeeId: event.target.value })}
                            className="block min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
                          >
                            <option value="">选择员工</option>
                            {assignableEmployees.map((employee) => (
                              <option key={employee.id} value={employee.id}>
                                {employee.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-ink-tertiary">扣减数量（默认=退货数量）</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={item.deductQuantity}
                            placeholder={item.quantity || '0'}
                            onChange={(event) => updateItem(index, { deductQuantity: event.target.value })}
                            className="block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
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
                disabled={!canSubmit || createMutation.isPending}
                className="min-h-11 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createMutation.isPending ? '提交中...' : '创建退货单'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Returns;
