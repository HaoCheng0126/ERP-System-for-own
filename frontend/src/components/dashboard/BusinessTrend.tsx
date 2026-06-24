import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import api from '../../utils/api';
import { formatAmount } from '../../utils/format';
import { DashboardFinancialStats, DashboardTrendPoint } from '../../types';
import { DashboardPeriod, PERIOD_WORD } from './PeriodToggle';

const W = 320;
const H = 132;
const PAD_X = 10;
const PAD_TOP = 12;
const PAD_BOTTOM = 26;

const buildPoints = (values: number[], max: number) => {
  const plotW = W - PAD_X * 2;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const step = values.length > 1 ? plotW / (values.length - 1) : 0;
  return values.map((value, index) => {
    const x = PAD_X + step * index;
    const y = PAD_TOP + (1 - value / max) * plotH;
    return { x, y };
  });
};

const toPolyline = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

const Bar: React.FC<{ label: string; gross: number; net: number; color: string }> = ({ label, gross, net, color }) => {
  const ratio = gross > 0 ? Math.min(net / gross, 1) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-secondary">{label}</span>
        <span className="tabular-nums text-ink-tertiary">{Math.round(ratio * 100)}%</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-canvas">
        <div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, backgroundColor: color }} />
      </div>
      <div className="mt-1 flex items-center justify-between text-xs tabular-nums text-ink-tertiary">
        <span>¥{formatAmount(gross)}</span>
        <span>已收/付 ¥{formatAmount(net)}</span>
      </div>
    </div>
  );
};

interface BusinessTrendProps {
  period: DashboardPeriod;
}

const BusinessTrend: React.FC<BusinessTrendProps> = ({ period }) => {
  const { data: trendData, isLoading } = useQuery<{ trends: DashboardTrendPoint[] }>({
    queryKey: ['businessTrends'],
    queryFn: async () => (await api.get('/dashboard/trends')).data,
  });
  const { data: sales } = useQuery<DashboardFinancialStats>({
    queryKey: ['salesStats', period],
    queryFn: async () => (await api.get('/dashboard/sales-stats', { params: { timeRange: period } })).data,
  });

  const trends = trendData?.trends ?? [];
  const max = Math.max(1, ...trends.flatMap((t) => [t.sales, t.purchase]));
  const salesPts = buildPoints(trends.map((t) => t.sales), max);
  const purchasePts = buildPoints(trends.map((t) => t.purchase), max);
  const gridYs = [PAD_TOP, PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) / 2, H - PAD_BOTTOM];

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-sm">
          <TrendingUp className="h-[18px] w-[18px]" />
        </span>
        <h2 className="text-base font-semibold text-ink">经营趋势</h2>
        <span className="ml-auto text-xs text-ink-tertiary">近 6 个月</span>
      </div>

      <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {isLoading ? (
            <div className="py-10 text-center text-sm text-ink-tertiary">加载中...</div>
          ) : (
            <>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" role="img" aria-label="近 6 个月销售与进货趋势">
                {gridYs.map((y) => (
                  <line key={y} x1={PAD_X} y1={y} x2={W - PAD_X} y2={y} stroke="#EDEEF0" strokeWidth="1" />
                ))}
                <polyline points={toPolyline(purchasePts)} fill="none" stroke="#1D9E75" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                <polyline points={toPolyline(salesPts)} fill="none" stroke="#3370FF" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {salesPts.map((p, i) => (
                  <circle key={`s${i}`} cx={p.x} cy={p.y} r="2.5" fill="#3370FF" />
                ))}
                {purchasePts.map((p, i) => (
                  <circle key={`p${i}`} cx={p.x} cy={p.y} r="2.5" fill="#1D9E75" />
                ))}
                {trends.map((t, i) => (
                  <text key={t.month} x={salesPts[i]?.x ?? 0} y={H - 8} textAnchor="middle" fontSize="9" fill="#8A8F99">
                    {t.label}
                  </text>
                ))}
              </svg>
              <div className="mt-2 flex items-center gap-4 text-xs text-ink-secondary">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded bg-brand-500" /> 销售
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded bg-emerald-500" /> 进货
                </span>
              </div>
            </>
          )}
        </div>

        <div className="space-y-4 lg:border-l lg:border-line lg:pl-5">
          <h3 className="text-sm font-medium text-ink-secondary">{PERIOD_WORD[period]}收支</h3>
          <Bar label="销售 / 回款" gross={sales?.salesAmount ?? 0} net={sales?.receivedAmount ?? 0} color="#3370FF" />
          <Bar label="进货 / 付款" gross={sales?.purchaseAmount ?? 0} net={sales?.paidAmount ?? 0} color="#1D9E75" />
        </div>
      </div>
    </div>
  );
};

export default BusinessTrend;
