import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { DeliveryOrder } from '../types';
import { formatAmount } from '../utils/format';

interface DeliveryPickerProps {
  deliveries: DeliveryOrder[];
  value: string;
  onSelect: (deliveryOrderId: string) => void;
  disabled?: boolean;
  returnedIds?: Set<string>;
}

// 退货时选「关联送货单」用：送货单多时按产品/日期/单号搜索，每条显示日期+产品摘要+金额，
// 而不是只给一个看不出内容的订单编号。
const summarizeItems = (order: DeliveryOrder) => {
  const names = (order.items || []).map((item) => item.product?.name).filter(Boolean) as string[];
  if (names.length === 0) return '无明细';
  if (names.length === 1) return names[0];
  return `${names[0]} 等${names.length}项`;
};

const DeliveryPicker = ({ deliveries, value, onSelect, disabled, returnedIds }: DeliveryPickerProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const selected = useMemo(() => deliveries.find((order) => order.id === value) || null, [deliveries, value]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return deliveries;
    return deliveries.filter((order) => {
      const haystack = [order.orderNumber, order.deliveryDate, ...(order.items || []).map((item) => item.product?.name || '')]
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [deliveries, query]);

  const pick = (id: string) => {
    onSelect(id);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2 text-left text-sm text-ink transition-colors hover:border-brand-300 focus:border-brand-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-tertiary"
      >
        <span className="min-w-0 truncate">
          {selected ? (
            <>
              <span className="text-ink-tertiary">{selected.deliveryDate} · </span>
              {summarizeItems(selected)}
              <span className="text-ink-tertiary"> · ¥{formatAmount(selected.totalAmount)}</span>
              {returnedIds?.has(selected.id) && (
                <span className="ml-1.5 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-500">已退货</span>
              )}
            </>
          ) : (
            <span className="text-ink-tertiary">不关联（手动选产品）</span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-tertiary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-line bg-white shadow-pop">
          <div className="border-b border-line-soft p-2">
            <div className="flex items-center gap-2 rounded-lg bg-canvas px-2.5 py-1.5">
              <Search className="h-4 w-4 shrink-0 text-ink-tertiary" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索产品 / 日期 / 单号"
                className="w-full bg-transparent text-sm text-ink placeholder:text-ink-tertiary focus:outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="shrink-0 text-ink-tertiary hover:text-ink">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => pick('')}
              className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-brand-50/50 ${
                value ? 'text-ink-secondary' : 'bg-brand-50 text-brand-600'
              }`}
            >
              不关联（手动选产品）
            </button>
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-ink-tertiary">没有匹配的送货单</div>
            ) : (
              filtered.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => pick(order.id)}
                  className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-brand-50/50 ${
                    order.id === value ? 'bg-brand-50' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink">{summarizeItems(order)}</span>
                      {returnedIds?.has(order.id) && (
                        <span className="shrink-0 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-500">已退货</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-tertiary">
                      {order.deliveryDate} · {order.orderNumber}
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-semibold tabular-nums text-ink">¥{formatAmount(order.totalAmount)}</div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DeliveryPicker;
