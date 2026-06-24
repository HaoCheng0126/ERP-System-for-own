export type DateRangeShortcut = 'today' | 'month' | 'year' | 'all';

export const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getDateRangeByShortcut = (shortcut: DateRangeShortcut) => {
  const today = new Date();

  if (shortcut === 'today') {
    const date = toDateInputValue(today);
    return { startDate: date, endDate: date };
  }

  if (shortcut === 'month') {
    return {
      startDate: toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)),
      endDate: toDateInputValue(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    };
  }

  if (shortcut === 'year') {
    return {
      startDate: toDateInputValue(new Date(today.getFullYear(), 0, 1)),
      endDate: toDateInputValue(new Date(today.getFullYear(), 11, 31)),
    };
  }

  return { startDate: '', endDate: '' };
};

export const normalizeSearchTerm = (value: string) => value.trim().toLowerCase();

export const matchesKeyword = (keyword: string, values: Array<string | number | null | undefined>) => {
  const normalizedKeyword = normalizeSearchTerm(keyword);
  if (!normalizedKeyword) return true;

  return values.some((value) => String(value ?? '').toLowerCase().includes(normalizedKeyword));
};

export const isNonZeroAmount = (value: number | string | null | undefined) => Math.abs(Number(value || 0)) > 0.0001;
