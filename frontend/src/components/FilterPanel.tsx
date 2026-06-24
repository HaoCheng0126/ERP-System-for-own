import React, { useState } from 'react';
import { Filter, Search, X } from 'lucide-react';
import { clsx } from 'clsx';

export type ActiveFilter = {
  key: string;
  label: string;
  onRemove: () => void;
};

type FilterPanelProps = {
  totalCount: number;
  filteredCount: number;
  activeFilters: ActiveFilter[];
  onClear: () => void;
  primary: React.ReactNode;
  advanced?: React.ReactNode;
  actions?: React.ReactNode;
  desktopInlineAdvanced?: boolean;
  resultLabel?: string;
  className?: string;
};

type FilterFieldProps = {
  label: string;
  children: React.ReactNode;
  className?: string;
};

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

type DateShortcut = 'today' | 'month' | 'year' | 'all';

type DateShortcutGroupProps = {
  onSelect: (shortcut: DateShortcut) => void;
  shortcuts?: DateShortcut[];
  className?: string;
};

const shortcutLabels: Record<DateShortcut, string> = {
  today: '今日',
  month: '本月',
  year: '今年',
  all: '全部',
};

export const FilterField: React.FC<FilterFieldProps> = ({ label, children, className }) => (
  <div className={clsx('min-w-0', className)}>
    <label className="mb-1 block text-xs font-medium text-ink-secondary">{label}</label>
    {children}
  </div>
);

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = '搜索',
  className,
}) => (
  <div className={clsx('relative', className)}>
    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="block min-h-11 w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm text-ink shadow-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
    />
  </div>
);

export const DateShortcutGroup: React.FC<DateShortcutGroupProps> = ({
  onSelect,
  shortcuts = ['today', 'month', 'year', 'all'],
  className,
}) => (
  <div className={clsx('grid gap-2', shortcuts.length === 4 ? 'grid-cols-4' : 'grid-cols-3', className)}>
    {shortcuts.map((shortcut) => (
      <button
        key={shortcut}
        type="button"
        onClick={() => onSelect(shortcut)}
        className="min-h-11 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-[#F2F3F5] hover:text-ink"
      >
        {shortcutLabels[shortcut]}
      </button>
    ))}
  </div>
);

const FilterPanel: React.FC<FilterPanelProps> = ({
  totalCount,
  filteredCount,
  activeFilters,
  onClear,
  primary,
  advanced,
  actions,
  desktopInlineAdvanced = false,
  resultLabel = '筛选结果',
  className,
}) => {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const hasActiveFilters = activeFilters.length > 0;

  return (
    <div className={clsx('border-b border-line bg-white px-4 py-3 md:px-6', className)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
          {primary}
          {advanced && desktopInlineAdvanced && (
            <div className="hidden md:contents">
              {advanced}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row lg:ml-auto">
          {advanced && (
            <button
              type="button"
              onClick={() => setIsAdvancedOpen((value) => !value)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-ink-secondary hover:bg-[#F2F3F5] hover:text-ink md:hidden"
            >
              <Filter className="h-4 w-4" />
              筛选
            </button>
          )}
          {actions}
        </div>
      </div>

      {advanced && !desktopInlineAdvanced && (
        <div
          className={clsx(
            'mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end',
            isAdvancedOpen ? 'grid' : 'hidden md:grid',
          )}
        >
          {advanced}
        </div>
      )}

      {advanced && desktopInlineAdvanced && isAdvancedOpen && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
          {advanced}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-tertiary">
          {resultLabel}: <span className="font-medium text-ink">{filteredCount}</span> / {totalCount}
        </span>
        {activeFilters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={filter.onRemove}
            className="inline-flex min-h-8 items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-100"
            title="移除筛选条件"
          >
            {filter.label}
            <X className="h-3.5 w-3.5" />
          </button>
        ))}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClear}
            className="ml-auto inline-flex min-h-8 items-center rounded-full px-3 py-1 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-50"
          >
            清除筛选
          </button>
        )}
      </div>
    </div>
  );
};

export default FilterPanel;
