import React from 'react';
import { ChevronDown, Download } from 'lucide-react';

export interface EntityStat {
  label: string;
  value: string;
}

interface EntityCardHeaderProps {
  name: string;
  initial: string;
  stats: EntityStat[];
  expanded: boolean;
  onToggle: () => void;
  onExport: (event: React.MouseEvent<HTMLButtonElement>) => void;
  note?: React.ReactNode;
  exportLabel?: string;
}

/**
 * 客户卡 / 供应商卡共用的可点击头部。
 * 渐变首字母方块 + 名称 + 可选提示 + 右侧 KPI 条 + 幽灵导出按钮 + 旋转 chevron。
 * 容器用 role="button" 而非 <button>，避免内嵌导出按钮触发 DOM 嵌套告警。
 */
function EntityCardHeader({
  name,
  initial,
  stats,
  expanded,
  onToggle,
  onExport,
  note,
  exportLabel = '导出',
}: EntityCardHeaderProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggle();
        }
      }}
      className="flex cursor-pointer flex-col gap-4 px-4 py-4 transition-colors hover:bg-canvas sm:flex-row sm:items-center sm:justify-between sm:px-5"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-[#7AA0FF] text-base font-semibold text-white shadow-sm">
          {initial}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-ink sm:text-lg">{name}</h3>
          {note && <div className="mt-0.5 text-xs text-amber-600">{note}</div>}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 sm:justify-end sm:gap-6">
        <div className="flex items-center gap-6 sm:gap-8">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-0">
              <p className="text-xs text-ink-tertiary">{stat.label}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{stat.value}</p>
            </div>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onExport(event);
            }}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-ink-secondary transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600"
            title="导出 PDF"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">{exportLabel}</span>
          </button>
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-ink-tertiary transition-transform duration-300 motion-reduce:transition-none ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </div>
      </div>
    </div>
  );
}

export default EntityCardHeader;
