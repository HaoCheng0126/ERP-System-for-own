const toNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'string' && value.trim() === '') {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const roundToScale = (value: number | string | null | undefined, scale: number) => {
  return Number(toNumber(value).toFixed(scale));
};

export const roundUnitPrice = (value: number | string | null | undefined) => {
  return roundToScale(value, 4);
};

export const roundQuantity = (value: number | string | null | undefined) => {
  return roundToScale(value, 4);
};

export const roundLineAmount = (
  quantity: number | string | null | undefined,
  unitPrice: number | string | null | undefined,
  scale = 4,
) => {
  return roundToScale(toNumber(quantity) * toNumber(unitPrice), scale);
};

export const roundCurrencyAmount = (value: number | string | null | undefined) => {
  return roundToScale(value, 2);
};
