import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, PackageX, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { formatEditableQty } from '../../utils/format';
import { Product, ProductType } from '../../types';

const TOP_N = 6;

type StockAlert = {
  product: Product;
  stock: number;
  threshold: number | null;
  level: 'out' | 'low';
  ratio: number; // stock / threshold（缺货为 0），用于排序与进度条
};

const buildAlerts = (products: Product[]): StockAlert[] => {
  const alerts: StockAlert[] = [];
  for (const product of products) {
    if (!product.isActive) continue;
    const stock = Number(product.stock || 0);
    const threshold =
      product.lowStockThreshold !== undefined && product.lowStockThreshold !== null
        ? Number(product.lowStockThreshold)
        : null;
    if (stock <= 0) {
      alerts.push({ product, stock, threshold, level: 'out', ratio: 0 });
    } else if (threshold !== null && threshold > 0 && stock <= threshold) {
      alerts.push({ product, stock, threshold, level: 'low', ratio: stock / threshold });
    }
  }
  // 缺货优先，其次按「库存/阈值」升序（越接近见底越靠前）
  return alerts.sort((a, b) => {
    if (a.level !== b.level) return a.level === 'out' ? -1 : 1;
    return a.ratio - b.ratio;
  });
};

const typeBadge = (type: ProductType) =>
  type === ProductType.FINISHED
    ? { label: '成品', cls: 'bg-sky-50 text-sky-600' }
    : { label: '原料', cls: 'bg-violet-50 text-violet-600' };

const StockAlertPanel: React.FC = () => {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const [keyword, setKeyword] = useState('');

  const { data, isLoading } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => (await api.get('/products')).data,
  });

  const alerts = useMemo(() => buildAlerts(data ?? []), [data]);
  const outCount = alerts.filter((a) => a.level === 'out').length;
  const top = alerts.slice(0, TOP_N);

  const filteredAll = useMemo(() => {
    const kw = keyword.trim();
    return kw ? alerts.filter((a) => `${a.product.name}${a.product.specification}`.includes(kw)) : alerts;
  }, [alerts, keyword]);

  const renderRow = (alert: StockAlert) => {
    const badge = typeBadge(alert.product.type);
    const isOut = alert.level === 'out';
    const barColor = isOut ? 'bg-rose-500' : 'bg-amber-400';
    const barWidth = isOut ? 100 : Math.max(6, Math.min(100, alert.ratio * 100));
    return (
      <div key={alert.product.id} className="py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.cls}`}>{badge.label}</span>
            <span className="truncate text-sm font-medium text-ink">{alert.product.name}</span>
            {alert.product.specification && (
              <span className="shrink-0 truncate text-xs text-ink-tertiary">{alert.product.specification}</span>
            )}
          </div>
          {isOut ? (
            <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600">缺货</span>
          ) : (
            <span className="shrink-0 text-sm font-semibold tabular-nums text-amber-600">
              {formatEditableQty(alert.stock)} {alert.product.unit}
            </span>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barWidth}%` }} />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-ink-tertiary">
            {alert.threshold !== null ? `预警值 ${formatEditableQty(alert.threshold)}` : '无安全库存'}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-card">
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-sm">
          <AlertTriangle className="h-[18px] w-[18px]" />
        </span>
        <h2 className="text-base font-semibold text-ink">库存预警</h2>
        {alerts.length > 0 && (
          <span className="ml-auto rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-600">
            {outCount > 0 ? `${outCount} 缺货 · ` : ''}{alerts.length} 项
          </span>
        )}
      </div>

      <div className="flex-1 px-5 py-2">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-ink-tertiary">加载中...</div>
        ) : top.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <PackageX className="h-7 w-7 text-ink-quaternary" />
            <p className="text-sm text-ink-tertiary">库存充足，暂无预警</p>
            <p className="text-xs text-ink-quaternary">可在产品管理为产品设置「安全库存」</p>
          </div>
        ) : (
          <div className="divide-y divide-line-soft">{top.map(renderRow)}</div>
        )}
      </div>

      {alerts.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="border-t border-line px-5 py-3 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50"
        >
          查看全部 {alerts.length} 项 ›
        </button>
      )}

      {showAll && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 sm:items-center sm:p-4">
          <div className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-pop sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h3 className="text-base font-semibold text-ink">库存预警</h3>
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
                  placeholder="搜索产品"
                  className="block min-h-11 w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
            <div className="flex-1 divide-y divide-line-soft overflow-y-auto px-5">
              {filteredAll.length === 0 ? (
                <div className="py-10 text-center text-sm text-ink-tertiary">没有匹配的产品</div>
              ) : (
                filteredAll.map(renderRow)
              )}
            </div>
            <button
              type="button"
              onClick={() => navigate('/products')}
              className="border-t border-line px-5 py-3 text-center text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50"
            >
              前往产品管理 ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockAlertPanel;
