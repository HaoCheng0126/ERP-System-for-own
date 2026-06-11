
export class ColumnNumericTransformer {
  to(data: number | null): number | null {
    return data;
  }
  from(data: string | null): number | null {
    if (data === null) {
      return null;
    }
    const res = parseFloat(data);
    if (isNaN(res)) {
      return null;
    }
    return res;
  }
}
