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

// 数量字段专用：整数显示无小数点（"6" 而非 "6.0000"），有效小数去除末尾零。
export const formatEditableQty = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '';
  return formatDisplayDecimal(parsed, 4);
};

export const formatUnitPrice = (value: number | string | null | undefined) => {
  return formatDisplayDecimal(value, 4);
};

// 概览/列表/汇总用：金额内部按 4 位小数存储，但对外展示四舍五入到 2 位。
export const formatAmount = (value: number | string | null | undefined) => {
  return formatDisplayDecimal(value, 2);
};

// 详情/明细用：展示完整的 4 位小数精度（单价可能是 4 位小数，金额=数量×单价）。
export const formatAmountDetail = (value: number | string | null | undefined) => {
  return formatDisplayDecimal(value, 4);
};

// 当一组行的单位唯一时，返回 "（unit）" 作为列名后缀；否则返回空字符串。
export const unitLabel = (units: (string | undefined | null)[]): string => {
  const unique = [...new Set(units.filter((u): u is string => Boolean(u)))];
  return unique.length === 1 ? `（${unique[0]}）` : '';
};
