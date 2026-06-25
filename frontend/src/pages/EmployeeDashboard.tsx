import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clock3, MinusCircle, PlusCircle, TrendingUp, Wallet } from 'lucide-react';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import PeriodToggle, { DashboardPeriod, PERIOD_WORD } from '../components/dashboard/PeriodToggle';
import api from '../utils/api';
import { User } from '../types';
import { formatAmount } from '../utils/format';

interface ProductBreakdownRow {
  productName: string;
  specification: string;
  quantity: number;
  wage: number;
}
interface TrendPoint {
  month: string;
  wage: number;
}
interface EmployeeStats {
  pendingCount: number;
  rejectedCount: number;
  periodLabel: string;
  periodApprovedWage: number;
  periodPendingWage: number;
  periodDeductions: number;
  periodNetSalary: number;
  periodCounts: { submitted: number; approved: number; rejected: number; pending: number };
  productBreakdown: ProductBreakdownRow[];
  trend: TrendPoint[];
}

const TONES = {
  brand: 'bg-brand-50 text-brand-600',
  amber: 'bg-amber-50 text-amber-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  rose: 'bg-rose-50 text-rose-600',
} as const;

interface KpiCardProps {
  icon: typeof Wallet;
  tone: keyof typeof TONES;
  label: string;
  value: string;
  sub: string;
  loading?: boolean;
  onClick?: () => void;
}

const KpiCard: React.FC<KpiCardProps> = ({ icon: Icon, tone, label, value, sub, loading, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className={`flex flex-col rounded-2xl border border-line bg-white p-4 text-left shadow-card transition-colors ${
      onClick ? 'hover:border-brand-200 hover:bg-brand-50/40' : 'cursor-default'
    }`}
  >
    <div className="mb-3 flex items-center justify-between">
      <span className="text-xs text-ink-tertiary">{label}</span>
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${TONES[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>
    </div>
    {loading ? (
      <div className="h-7 w-20 animate-pulse rounded bg-line-soft" />
    ) : (
      <div className="text-2xl font-bold tabular-nums text-ink">{value}</div>
    )}
    <div className="mt-1 text-xs text-ink-tertiary">{sub}</div>
  </button>
);

const EmployeeDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [pickedMonth, setPickedMonth] = useState(''); // 'YYYY-MM'，选中后覆盖 period

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) setCurrentUser(JSON.parse(userStr));
  }, []);

  const { data: stats, isLoading } = useQuery<EmployeeStats>({
    queryKey: ['employeeStats', pickedMonth || period],
    queryFn: async () => {
      const params = pickedMonth ? { month: pickedMonth } : { period };
      return (await api.get('/dashboard/employee-stats', { params })).data;
    },
  });

  const periodLabel = stats?.periodLabel || (pickedMonth || PERIOD_WORD[period]);
  const breakdown = stats?.productBreakdown || [];
  const trend = stats?.trend || [];
  const maxWage = Math.max(1, ...trend.map((t) => t.wage));

  return (
    <Layout>
      <PageHeader title="工作台" />

      <div className="space-y-5 px-4 pb-6 pt-0 md:px-6">
        {/* 周期控制 */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <PeriodToggle
              value={period}
              onChange={(p) => {
                setPeriod(p);
                setPickedMonth('');
              }}
            />
            <input
              type="month"
              value={pickedMonth}
              onChange={(e) => setPickedMonth(e.target.value)}
              className="min-h-9 rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {pickedMonth && (
              <button
                type="button"
                onClick={() => setPickedMonth('')}
                className="text-xs text-ink-tertiary transition-colors hover:text-ink"
              >
                清除
              </button>
            )}
          </div>
          <span className="text-sm text-ink-tertiary">
            统计周期：<span className="font-medium text-ink">{periodLabel}</span>
          </span>
        </div>

        {/* KPI 卡片 */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={Wallet}
            tone={(stats?.periodDeductions ?? 0) > 0 ? 'rose' : 'brand'}
            label={`${periodLabel}实发工资`}
            value={`¥${formatAmount(stats?.periodNetSalary ?? stats?.periodApprovedWage ?? 0)}`}
            sub={
              (stats?.periodDeductions ?? 0) > 0
                ? `入库¥${formatAmount(stats!.periodApprovedWage)} 已扣¥${formatAmount(stats!.periodDeductions)}`
                : `${stats?.periodCounts?.approved || 0} 单已通过`
            }
            loading={isLoading}
          />
          {(stats?.periodDeductions ?? 0) > 0 ? (
            <KpiCard
              icon={MinusCircle}
              tone="rose"
              label={`${periodLabel}扣款总额`}
              value={`-¥${formatAmount(stats!.periodDeductions)}`}
              sub="退货质量扣减"
              loading={isLoading}
            />
          ) : (
            <KpiCard
              icon={Clock3}
              tone="amber"
              label="待审预估工价"
              value={`¥${formatAmount(stats?.periodPendingWage || 0)}`}
              sub={`${stats?.periodCounts?.pending || 0} 单待审核`}
              loading={isLoading}
            />
          )}
          <KpiCard
            icon={CheckCircle2}
            tone="emerald"
            label={`${periodLabel}提交`}
            value={`${stats?.periodCounts?.submitted || 0}`}
            sub="单（含待审/已拒）"
            loading={isLoading}
          />
          <KpiCard
            icon={AlertCircle}
            tone="rose"
            label="被驳回待处理"
            value={`${stats?.rejectedCount || 0}`}
            sub={stats?.rejectedCount ? '点我去修改重提 →' : '暂无被驳回'}
            loading={isLoading}
            onClick={stats?.rejectedCount ? () => navigate('/inventory') : undefined}
          />
        </div>

        {/* 产量明细 + 工价走势 */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-card lg:col-span-3">
            <div className="border-b border-line-soft px-5 py-3.5">
              <h3 className="text-sm font-semibold text-ink">我的产量明细 · {periodLabel}</h3>
              <p className="mt-0.5 text-xs text-ink-tertiary">按产品统计「已通过」的数量与工价</p>
            </div>
            {breakdown.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-ink-tertiary">
                {isLoading ? '加载中…' : '该周期暂无已通过的入库记录'}
              </div>
            ) : (
              <ul className="divide-y divide-line-soft">
                {breakdown.map((row, index) => (
                  <li key={`${row.productName}-${index}`} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink">{row.productName}</div>
                      {row.specification && (
                        <div className="truncate text-xs text-ink-tertiary">{row.specification}</div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold tabular-nums text-ink">¥{formatAmount(row.wage)}</div>
                      <div className="text-xs text-ink-tertiary tabular-nums">×{row.quantity}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-line bg-white p-5 shadow-card lg:col-span-2">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-brand-600" />
              <h3 className="text-sm font-semibold text-ink">近 6 个月工价走势</h3>
            </div>
            <div className="flex h-40 items-end justify-between gap-2">
              {trend.length === 0 ? (
                <div className="w-full text-center text-sm text-ink-tertiary">暂无数据</div>
              ) : (
                trend.map((t) => (
                  <div
                    key={t.month}
                    className="flex flex-1 flex-col items-center gap-1.5"
                    title={`${t.month}：¥${formatAmount(t.wage)}`}
                  >
                    <div
                      className="w-full rounded-t bg-brand-500/80 transition-all"
                      style={{ height: `${Math.max(4, (t.wage / maxWage) * 120)}px` }}
                    />
                    <span className="text-[10px] text-ink-tertiary">{t.month.slice(5)}月</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* 快捷操作 */}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => navigate('/inventory')}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            <PlusCircle className="h-4 w-4" />
            提交入库单
          </button>
          <button
            type="button"
            onClick={() => navigate('/salary')}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink-secondary shadow-sm transition-colors hover:bg-canvas"
          >
            查看工资报表
          </button>
        </div>
      </div>

      {currentUser && (
        <button
          type="button"
          onClick={() => navigate('/employee-system')}
          className="fixed bottom-6 right-6 flex items-center gap-3 rounded-full border border-line bg-white px-4 py-2 shadow-pop transition-shadow hover:shadow-lg"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7E6BF6] text-sm font-medium text-white">
            {currentUser.name.charAt(0)}
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-ink">{currentUser.name}</div>
            <div className="text-xs text-ink-tertiary">计件工人</div>
          </div>
        </button>
      )}
    </Layout>
  );
};

export default EmployeeDashboard;
