export interface SummaryStat {
  label: string;
  value: string;
}

interface RecordsSummaryBarProps {
  stats: SummaryStat[];
}

/**
 * 列表顶部汇总条：呼应火山「关键指标先行」。
 * 等分列、发丝分隔；移动端字号收紧，桌面端放大。
 */
function RecordsSummaryBar({ stats }: RecordsSummaryBarProps) {
  return (
    <div className="flex items-stretch divide-x divide-line-soft overflow-hidden rounded-2xl border border-line bg-white shadow-card">
      {stats.map((stat) => (
        <div key={stat.label} className="min-w-0 flex-1 px-3 py-3 sm:px-5 sm:py-4">
          <p className="truncate text-xs text-ink-tertiary">{stat.label}</p>
          <p className="mt-1 break-words text-base font-semibold leading-tight tabular-nums text-ink sm:text-2xl">
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export default RecordsSummaryBar;
