import React from 'react';

export type DashboardPeriod = 'today' | 'month' | 'year';

export const PERIOD_WORD: Record<DashboardPeriod, string> = {
  today: '今日',
  month: '本月',
  year: '本年',
};

const OPTIONS: DashboardPeriod[] = ['today', 'month', 'year'];

interface PeriodToggleProps {
  value: DashboardPeriod;
  onChange: (value: DashboardPeriod) => void;
}

const PeriodToggle: React.FC<PeriodToggleProps> = ({ value, onChange }) => (
  <div className="flex rounded-lg bg-[#F2F3F5] p-0.5">
    {OPTIONS.map((option) => (
      <button
        key={option}
        type="button"
        onClick={() => onChange(option)}
        className={`rounded-md px-3 py-1 text-sm font-medium transition-all ${
          value === option ? 'bg-white text-brand-600 shadow-sm' : 'text-ink-secondary hover:text-ink'
        }`}
      >
        {PERIOD_WORD[option]}
      </button>
    ))}
  </div>
);

export default PeriodToggle;
