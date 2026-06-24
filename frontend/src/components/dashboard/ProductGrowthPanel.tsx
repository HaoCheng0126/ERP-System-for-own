import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, Search, TrendingUp, X } from 'lucide-react';
import api from '../../utils/api';
import { formatAmount, formatDisplayDecimal } from '../../utils/format';

interface ProductGrowth {
  id: string;
  name: string;
  todayQty: number;
  yesterdayQty: number;
  growthRate: number;
}

interface InventoryStats {
  totalProductionValue: number;
  productGrowth: ProductGrowth[];
}

const TOP_N = 6;
const MIN_PREVIEW = 3;

const byChangeDesc = (a: ProductGrowth, b: ProductGrowth) =>
  Math.abs(b.todayQty - b.yesterdayQty) - Math.abs(a.todayQty - a.yesterdayQty);

const GrowthBadge: React.FC<{ rate: number }> = ({ rate }) => (
  <span
    className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${
      rate > 0 ? 'bg-emerald-50 text-emerald-700' : rate < 0 ? 'bg-rose-50 text-rose-700' : 'bg-[#F2F3F5] text-ink-secondary'
    }`}
  >
    {rate > 0 ? '+' : ''}
    {rate.toFixed(1)}%
    {rate !== 0 && <TrendingUp className={`h-3 w-3 ${rate < 0 ? 'rotate-180' : ''}`} />}
  </span>
);

const Row: React.FC<{ item: ProductGrowth }> = ({ item }) => (
  <div className="flex items-center justify-between gap-3 py-2.5">
    <div className="min-w-0">
      <div className="truncate text-sm font-medium text-ink">{item.name}</div>
      <div className="mt-0.5 text-xs tabular-nums text-ink-tertiary">
        今日 {formatDisplayDecimal(item.todayQty, 4)} · 昨日 {formatDisplayDecimal(item.yesterdayQty, 4)}
      </div>
    </div>
    <GrowthBadge rate={item.growthRate} />
  </div>
);

const ProductGrowthPanel: React.FC = () => {
  const [showAll, setShowAll] = useState(false);
  const [keyword, setKeyword] = useState('');

  const { data, isLoading } = useQuery<InventoryStats>({
    queryKey: ['inventoryStats', 'today'],
    queryFn: async () => (await api.get('/dashboard/inventory-stats', { params: { timeRange: 'today' } })).data,
  });

  const all = data?.productGrowth ?? [];
  // 外部预览：优先展示有变动的产品；不足 MIN_PREVIEW 时用其余产品补足，保证至少看到 3 个。
  const preview = useMemo(() => {
    const sorted = [...all].sort(byChangeDesc);
    const changed = sorted.filter((p) => p.todayQty > 0 || p.yesterdayQty > 0);
    if (changed.length >= TOP_N) return changed.slice(0, TOP_N);
    if (changed.length >= MIN_PREVIEW) return changed;
    const rest = sorted.filter((p) => !(p.todayQty > 0 || p.yesterdayQty > 0));
    return [...changed, ...rest].slice(0, MIN_PREVIEW);
  }, [all]);

  const filteredAll = useMemo(() => {
    const kw = keyword.trim();
    const base = [...all].sort(byChangeDesc);
    return kw ? base.filter((p) => p.name.includes(kw)) : base;
  }, [all, keyword]);

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-card">
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-sm">
          <Package className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">产品产量变动</h2>
          <p className="text-xs text-ink-tertiary">今日产值 ¥{formatAmount(data?.totalProductionValue)}</p>
        </div>
      </div>

      <div className="flex-1 px-5 py-2">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-ink-tertiary">加载中...</div>
        ) : preview.length === 0 ? (
          <div className="py-8 text-center text-sm text-ink-tertiary">暂无产品数据</div>
        ) : (
          <div className="divide-y divide-line-soft">
            {preview.map((item) => (
              <Row key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      {all.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="border-t border-line px-5 py-3 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50"
        >
          查看全部 {all.length} 个产品 ›
        </button>
      )}

      {showAll && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 sm:items-center sm:p-4">
          <div className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-pop sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h3 className="text-base font-semibold text-ink">全部产品产量变动</h3>
              <button type="button" onClick={() => setShowAll(false)} className="text-ink-tertiary hover:text-ink" aria-label="关闭">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="border-b border-line px-5 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
                <input
                  type="search"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="搜索产品名称"
                  className="block min-h-11 w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
            <div className="flex-1 divide-y divide-line-soft overflow-y-auto px-5">
              {filteredAll.length === 0 ? (
                <div className="py-10 text-center text-sm text-ink-tertiary">没有匹配的产品</div>
              ) : (
                filteredAll.map((item) => <Row key={item.id} item={item} />)
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductGrowthPanel;
