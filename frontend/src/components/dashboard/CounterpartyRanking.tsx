import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Search, Users, X } from 'lucide-react';
import api from '../../utils/api';
import { formatAmount } from '../../utils/format';
import { CounterpartyStat, CustomerType, DashboardCounterpartyStats } from '../../types';

interface CounterpartyRankingProps {
  type: CustomerType;
}

const TOP_N = 5;

const hasBalance = (item: CounterpartyStat) => Math.abs(Number(item.endingBalance || 0)) > 0.0001;

const CounterpartyRanking: React.FC<CounterpartyRankingProps> = ({ type }) => {
  const [showAll, setShowAll] = useState(false);
  const [keyword, setKeyword] = useState('');

  const { data, isLoading } = useQuery<DashboardCounterpartyStats>({
    queryKey: ['customerStats'],
    queryFn: async () => (await api.get('/dashboard/customer-stats')).data,
  });

  const isClient = type === CustomerType.CLIENT;
  const title = isClient ? '客户应收排行' : '供应商应付排行';
  const businessLabel = isClient ? '累计送货' : '累计进货';
  const paymentLabel = isClient ? '累计回款' : '累计付款';
  const balanceLabel = isClient ? '应收余额' : '应付余额';
  const Icon = isClient ? Users : Building2;
  const chip = isClient ? 'from-sky-500 to-blue-500' : 'from-violet-500 to-purple-500';

  const items = useMemo(() => {
    const base = (isClient ? data?.clients : data?.suppliers) ?? [];
    return [...base].sort((a, b) => Math.abs(Number(b.endingBalance || 0)) - Math.abs(Number(a.endingBalance || 0)));
  }, [data, isClient]);
  const top = items.slice(0, TOP_N);

  const filteredAll = useMemo(() => {
    const kw = keyword.trim();
    return kw ? items.filter((c) => c.name.includes(kw)) : items;
  }, [items, keyword]);

  const balanceTone = (item: CounterpartyStat) => (hasBalance(item) ? 'text-amber-600' : 'text-emerald-600');

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-card">
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${chip} text-white shadow-sm`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <span className="ml-auto rounded-full bg-canvas px-2.5 py-0.5 text-xs font-medium text-ink-secondary">{items.length} 项</span>
      </div>

      <div className="flex-1 px-5 py-2">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-ink-tertiary">加载中...</div>
        ) : top.length === 0 ? (
          <div className="py-8 text-center text-sm text-ink-tertiary">暂无数据</div>
        ) : (
          <div className="divide-y divide-line-soft">
            {top.map((item, index) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-canvas text-xs font-semibold tabular-nums text-ink-tertiary">
                    {index + 1}
                  </span>
                  <span className="truncate text-sm font-medium text-ink">{item.name}</span>
                </div>
                <span className={`shrink-0 text-sm font-semibold tabular-nums ${balanceTone(item)}`}>
                  ¥{formatAmount(item.endingBalance)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="border-t border-line px-5 py-3 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50"
        >
          查看全部 {items.length} 个 ›
        </button>
      )}

      {showAll && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 sm:items-center sm:p-4">
          <div className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-pop sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h3 className="text-base font-semibold text-ink">{title}</h3>
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
                  placeholder="搜索名称"
                  className="block min-h-11 w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
            <div className="flex-1 divide-y divide-line-soft overflow-y-auto px-5">
              {filteredAll.length === 0 ? (
                <div className="py-10 text-center text-sm text-ink-tertiary">没有匹配的往来方</div>
              ) : (
                filteredAll.map((item) => (
                  <div key={item.id} className="py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">{item.name}</span>
                      <span className={`shrink-0 text-sm font-semibold tabular-nums ${balanceTone(item)}`}>
                        ¥{formatAmount(item.endingBalance)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-xs tabular-nums text-ink-tertiary">
                      <span>{businessLabel} ¥{formatAmount(item.totalBusiness)}</span>
                      <span>{paymentLabel} ¥{formatAmount(item.totalPayment)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-line px-5 py-2 text-center text-xs text-ink-tertiary">{balanceLabel}（橙色为未结清）</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CounterpartyRanking;
