import Decimal from 'decimal.js';

// Financial arithmetic helpers. Everything is computed with decimal.js and
// converted back to a JS number only at the end, rounded to the given number
// of decimal places (2 for money by default).

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_EVEN });

export type Num = number | string | Decimal | null | undefined;

export const D = (v: Num): Decimal => new Decimal(v ?? 0);

export function sum(values: Num[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(D(v)), new Decimal(0));
}

/** Round to money (2dp, banker's rounding) and return a number. */
export function money(v: Num, dp = 2): number {
  return D(v).toDecimalPlaces(dp).toNumber();
}

export function mul(a: Num, b: Num): Decimal {
  return D(a).times(D(b));
}

/** Safe division: returns null when the divisor is zero. */
export function div(a: Num, b: Num): Decimal | null {
  const d = D(b);
  if (d.isZero()) return null;
  return D(a).dividedBy(d);
}

/** Parse a user-entered amount like "£1,234.56" into a decimal string. */
export function parseAmount(input: string): string | null {
  const cleaned = input.replace(/[£$€,\s]/g, '').trim();
  if (cleaned === '' || !/^-?\d*(\.\d*)?$/.test(cleaned) || cleaned === '-' || cleaned === '.') return null;
  try {
    return new Decimal(cleaned).toString();
  } catch {
    return null;
  }
}

export { Decimal };
