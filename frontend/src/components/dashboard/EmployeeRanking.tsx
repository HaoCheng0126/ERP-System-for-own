import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Award, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { formatAmount, formatEditableQty } from '../../utils/format';
import { SalaryReport, SalaryReportItem } from '../../types';

const TOP_N = 5;

const RANK_BADGE = ['bg-amber-400 text-white', 'bg-slate-300 text-white', 'bg-orange-300 text-white'];

const currentMonthParam = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const EmployeeRanking: React.FC = () => {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const [keyword, setKeyword] = useState('');
  const month = currentMonthParam();

  const { data, isLoading } = useQuery<SalaryReport>({
    queryKey: ['salaryReport', month],
    queryFn: async () => (await api.get('/salary/report', { params: { month } })).data,
  });

  // 按本月净工资降序；过滤掉零产出（净工资和产量都为 0）的员工
  const items = useMemo(() => {
    const base = data?.report ?? [];
    return [...base]
      .filter((r) => Number(r.netSalary || 0) !== 0 || Number(r.totalQuantity || 0) > 0)
      .sort((a, b) => Number(b.netSalary || 0) - Number(a.netSalary || 0));
  }, [data]);

  const top = items.slice(0, TOP_N);
  const maxWage = useMemo(() => Math.max(1, ...items.map((r) => Number(r.netSalary || 0))), [items]);

  const filteredAll = useMemo(() => {
    const kw = keyword.trim();
    return kw ? items.filter((r) => (r.user?.name || '').includes(kw)) : items;
  }, [items, keyword]);

  const monthLabel = `${new Date().getMonth() + 1} 月`;

  const renderRow = (item: SalaryReportItem, index: number) => {
    const wage = Number(item.netSalary || 0);
    const ratio = Math.max(0.04, wage / maxWage);
    const badge = RANK_BADGE[index] ?? 'bg-canvas text-ink-tertiary';
    return (
      <div key={item.user?.id ?? index} className="py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums ${badge}`}>
              {index + 1}
            </span>
            <span className="truncate text-sm font-medium text-ink">{item.user?.name || '未知员工'}</span>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">¥{formatAmount(wage)}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-ink-tertiary">{formatEditableQty(item.totalQuantity)} 件</span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-card">
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm">
          <Award className="h-[18px] w-[18px]" />
        </span>
        <h2 className="text-base font-semibold text-ink">员工产量排行</h2>
        <span className="ml-auto rounded-full bg-canvas px-2.5 py-0.5 text-xs font-medium text-ink-secondary">{monthLabel}</span>
      </div>

      <div className="flex-1 px-5 py-2">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-ink-tertiary">加载中...</div>
        ) : top.length === 0 ? (
          <div className="py-8 text-center text-sm text-ink-tertiary">本月暂无计件产出</div>
        ) : (
          <div className="divide-y divide-line-soft">{top.map(renderRow)}</div>
        )}
      </div>

      {items.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="border-t border-line px-5 py-3 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50"
        >
          查看全部 {items.length} 人 ›
        </button>
      )}

      {showAll && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 sm:items-center sm:p-4">
          <div className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-pop sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h3 className="text-base font-semibold text-ink">员工产量排行 · {monthLabel}</h3>
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
                  placeholder="搜索员工"
                  className="block min-h-11 w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
            <div className="flex-1 divide-y divide-line-soft overflow-y-auto px-5">
              {filteredAll.length === 0 ? (
                <div className="py-10 text-center text-sm text-ink-tertiary">没有匹配的员工</div>
              ) : (
                filteredAll.map((item, index) => (
                  <div key={item.user?.id ?? index} className="py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">{item.user?.name || '未知员工'}</span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">¥{formatAmount(item.netSalary)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-xs tabular-nums text-ink-tertiary">
                      <span>产量 {formatEditableQty(item.totalQuantity)} 件</span>
                      <span>应发 ¥{formatAmount(item.grossAmount)}</span>
                      {Number(item.totalDeductions || 0) > 0 && (
                        <span className="text-rose-400">扣款 ¥{formatAmount(item.totalDeductions)}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={() => navigate('/salary')}
              className="border-t border-line px-5 py-3 text-center text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50"
            >
              前往工资报表 ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeRanking;
