const parseDecimal = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatDisplayDecimal = (
  value: number | string | null | undefined,
  maxDecimals = 4,
) => {
  const parsed = parseDecimal(value);
  const fixedValue = parsed.toFixed(maxDecimals);
  const trimmedValue = fixedValue.replace(/(?:\.0+|(\.\d*?[1-9])0+)$/, '$1');
  return trimmedValue === '-0' ? '0' : trimmedValue;
};

export const formatEditableDecimal = (
  value: number | string | null | undefined,
  decimals = 4,
) => {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return '';
  }

  return parsed.toFixed(decimals);
};

export const formatUnitPrice = (value: number | string | null | undefined) => {
  return formatDisplayDecimal(value, 4);
};

export const formatAmount = (value: number | string | null | undefined) => {
  return formatDisplayDecimal(value, 4);
};
