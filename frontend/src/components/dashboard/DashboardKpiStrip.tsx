import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, ClipboardList } from 'lucide-react';
import api from '../../utils/api';
import { formatAmount } from '../../utils/format';
import { DashboardAdminStats, DashboardFinancialStats } from '../../types';
import { DashboardPeriod, PERIOD_WORD } from './PeriodToggle';

interface KpiItem {
  key: string;
  label: string;
  value: string;
  delta?: number;
  tone?: 'neutral' | 'warning' | 'danger';
}

const Delta: React.FC<{ value: number }> = ({ value }) => {
  if (!value) {
    return <span className="text-xs text-ink-tertiary">环比持平</span>;
  }
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
      {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
};

interface DashboardKpiStripProps {
  period: DashboardPeriod;
}

const DashboardKpiStrip: React.FC<DashboardKpiStripProps> = ({ period }) => {
  const navigate = useNavigate();
  const word = PERIOD_WORD[period];

  const { data: sales } = useQuery<DashboardFinancialStats>({
    queryKey: ['salesStats', period],
    queryFn: async () => (await api.get('/dashboard/sales-stats', { params: { timeRange: period } })).data,
  });
  const { data: admin } = useQuery<DashboardAdminStats>({
    queryKey: ['adminStats'],
    queryFn: async () => (await api.get('/dashboard/admin-stats')).data,
  });
  const { data: inventory } = useQuery<{ totalProductionValue: number }>({
    queryKey: ['inventoryStats', period],
    queryFn: async () => (await api.get('/dashboard/inventory-stats', { params: { timeRange: period } })).data,
  });

  const items: KpiItem[] = [
    {
      key: 'sales',
      label: `${word}销售额`,
      value: `¥${formatAmount(sales?.salesAmount)}`,
      // 环比只在「本月」口径下有意义（月度环比），其它口径不展示，避免误导。
      delta: period === 'month' ? admin?.monthGrowthRate : undefined,
    },
    { key: 'output', label: `${word}产值`, value: `¥${formatAmount(inventory?.totalProductionValue)}` },
    { key: 'receivable', label: '客户应收', value: `¥${formatAmount(sales?.receivableBalance)}`, tone: 'warning' },
    { key: 'payable', label: '供应商应付', value: `¥${formatAmount(sales?.payableBalance)}`, tone: 'danger' },
  ];

  const valueTone = (tone?: KpiItem['tone']) =>
    tone === 'warning' ? 'text-amber-600' : tone === 'danger' ? 'text-rose-600' : 'text-ink';

  const pending = admin?.pendingReviewCount ?? 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <div key={item.key} className="rounded-2xl border border-line bg-white p-4 shadow-card">
          <p className="truncate text-xs text-ink-tertiary">{item.label}</p>
          <p className={`mt-1.5 break-words text-xl font-bold leading-tight tabular-nums sm:text-2xl ${valueTone(item.tone)}`}>
            {item.value}
          </p>
          {item.delta !== undefined ? (
            <div className="mt-1.5">
              <Delta value={item.delta} />
            </div>
          ) : item.tone ? (
            <p className="mt-1.5 text-xs text-ink-tertiary">当前未结清</p>
          ) : null}
        </div>
      ))}

      <button
        type="button"
        onClick={() => navigate('/inventory')}
        className={`group flex flex-col items-start rounded-2xl border p-4 text-left shadow-card transition-colors ${
          pending > 0 ? 'border-brand-200 bg-brand-50 hover:bg-brand-100' : 'border-line bg-white hover:bg-canvas'
        }`}
      >
        <div className="flex w-full items-center justify-between">
          <p className="truncate text-xs text-brand-700">待审核入库</p>
          <ClipboardList className="h-4 w-4 text-brand-500" />
        </div>
        <p className="mt-1.5 text-xl font-bold tabular-nums text-brand-700 sm:text-2xl">{pending}</p>
        <span className="mt-1.5 text-xs font-medium text-brand-600 group-hover:underline">去处理 →</span>
      </button>
    </div>
  );
};

export default DashboardKpiStrip;
