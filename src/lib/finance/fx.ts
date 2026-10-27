import { D, Decimal } from '../money';

/**
 * Exchange rates expressed as "units of the base currency (GBP) per 1 unit of
 * the currency". GBX (pence) is always exactly 0.01 GBP.
 *
 * Assumption: historical values in other currencies are converted at the
 * latest available rate, not the rate on the day.
 */
export type FxRates = Record<string, number>;

export const DEFAULT_BASE = 'GBP';

export function withFixedRates(rates: FxRates): FxRates {
  return { ...rates, GBP: 1, GBX: 0.01 };
}

/** Convert an amount; returns null when a needed rate is missing. */
export function convert(amount: Decimal | number, from: string, to: string, rates: FxRates): Decimal | null {
  const a = D(amount);
  if (from === to) return a;
  const all = withFixedRates(rates);
  const fromRate = all[from];
  const toRate = all[to];
  if (fromRate == null || toRate == null || toRate === 0) return null;
  return a.times(fromRate).dividedBy(toRate);
}

/** Convert, falling back to the unconverted amount when a rate is missing. */
export function convertOrSame(amount: Decimal | number, from: string, to: string, rates: FxRates): Decimal {
  return convert(amount, from, to, rates) ?? D(amount);
}

export function hasRate(currency: string, rates: FxRates): boolean {
  return withFixedRates(rates)[currency] != null;
}
