interface DateSectionHeaderProps {
  date: string;
  count: number;
  countLabel: string;
  amount: number;
  formatAmount: (value: number) => string;
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const toStartOfDay = (value: Date): Date =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 把 YYYY-MM-DD 日期字符串转成中文时间线标签：今天 / 昨天 / M月D日 周X。
 * 解析失败时回退原始字符串。
 */
function formatCnDate(raw: string): string {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }

  const target = toStartOfDay(parsed);
  const today = toStartOfDay(new Date());
  const diffDays = Math.round((today.getTime() - target.getTime()) / MS_PER_DAY);
  const base = `${target.getMonth() + 1}月${target.getDate()}日`;

  if (diffDays === 0) return `今天 · ${base}`;
  if (diffDays === 1) return `昨天 · ${base}`;
  return `${base} ${WEEKDAY_LABELS[target.getDay()]}`;
}

/**
 * 时间线日期分隔头：圆点 + 中文日期 + 发丝分隔线 + 当日条数与金额。
 */
function DateSectionHeader({ date, count, countLabel, amount, formatAmount }: DateSectionHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-1 pb-1 pt-1">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
      <span className="shrink-0 text-sm font-semibold text-ink">{formatCnDate(date)}</span>
      <span className="h-px flex-1 bg-line-soft" />
      <span className="shrink-0 text-xs tabular-nums text-ink-tertiary">
        {count} {countLabel} · ¥{formatAmount(amount)}
      </span>
    </div>
  );
}

export default DateSectionHeader;
