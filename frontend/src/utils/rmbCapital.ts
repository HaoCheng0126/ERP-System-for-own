// 人民币金额转中文大写（用于送货单、对账单等单据的「合计人民币（大写）」栏）
// 例：14738 -> 壹万肆仟柒佰叁拾捌元整；100.5 -> 壹佰元伍角；0 -> 零元整
// 采用业界通行的「分段构建 + 正则清理零」算法，整数部分以「分」为单位计算，规避浮点误差。

const DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const BIG_UNITS = ['元', '万', '亿', '兆'];
const SMALL_UNITS = ['', '拾', '佰', '仟'];

export const numberToRmbCapital = (value: number): string => {
  if (!Number.isFinite(value)) return '';

  const negative = value < 0;
  const cents = Math.round(Math.abs(value) * 100);
  if (cents === 0) return '零元整';

  const jiao = Math.floor(cents / 10) % 10;
  const fen = cents % 10;
  let integer = Math.floor(cents / 100);

  // 角分部分：先拼「零角/零分」再剥离前导零，便于后续统一清理
  let result = '';
  result += (DIGITS[jiao] + '角').replace(/零角/, '');
  result += (DIGITS[fen] + '分').replace(/零分/, '');
  result = result || '整';

  // 整数部分：按「元/万/亿/兆」每四位分段构建
  for (let unitIndex = 0; unitIndex < BIG_UNITS.length && integer > 0; unitIndex += 1) {
    let section = '';
    for (let position = 0; position < SMALL_UNITS.length && integer > 0; position += 1) {
      section = DIGITS[integer % 10] + SMALL_UNITS[position] + section;
      integer = Math.floor(integer / 10);
    }
    section = section.replace(/(零.)*零$/, '').replace(/^$/, '零');
    result = section + BIG_UNITS[unitIndex] + result;
  }

  result = result
    .replace(/(零.)*零元/, '元')
    .replace(/(零.)+/g, '零')
    .replace(/^整$/, '零元整');

  return (negative ? '负' : '') + result;
};
