import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import api from '../../utils/api';
import { formatDisplayDecimal } from '../../utils/format';
import { DashboardAdminStats } from '../../types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const formatWhen = (raw: string): string => {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((startOfDay(new Date()).getTime() - startOfDay(date).getTime()) / MS_PER_DAY);
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (diff === 0) return `今天 ${time}`;
  if (diff === 1) return `昨天 ${time}`;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};

const RecentActivity: React.FC = () => {
  const { data, isLoading } = useQuery<DashboardAdminStats>({
    queryKey: ['adminStats'],
    queryFn: async () => (await api.get('/dashboard/admin-stats')).data,
  });

  const records = data?.recentRecords ?? [];

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-sm">
          <Activity className="h-[18px] w-[18px]" />
        </span>
        <h2 className="text-base font-semibold text-ink">最近入库动态</h2>
      </div>

      {isLoading ? (
        <div className="px-5 py-8 text-center text-sm text-ink-tertiary">加载中...</div>
      ) : records.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-ink-tertiary">暂无入库记录</div>
      ) : (
        <ul className="divide-y divide-line-soft">
          {records.map((record) => (
            <li key={record.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-600">
                  {record.submitterName?.slice(0, 1) || '员'}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">
                    <span className="font-medium">{record.submitterName}</span>
                    <span className="text-ink-tertiary"> 入库 </span>
                    {record.productName}
                  </p>
                  <p className="text-xs text-ink-tertiary">{record.recordNumber}</p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums text-ink">×{formatDisplayDecimal(record.quantity, 4)}</p>
                <p className="text-xs text-ink-tertiary">{formatWhen(record.createdAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default RecentActivity;
