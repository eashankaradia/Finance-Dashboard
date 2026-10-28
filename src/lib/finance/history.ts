import { addMonths } from '../dates';
import { D, Decimal } from '../money';
import type { Account, Asset, Holding, ISODate, Transaction } from '../types';
import { convert, type FxRates } from './fx';

/**
 * Holding performance over time, from stored daily closing prices.
 *
 * - Units held on a day = opening units + linked buys − linked sells up to
 *   and including that day. The opening position has no date, so it counts
 *   as held throughout.
 * - Value = units × that day's close, converted to the account currency at
 *   the latest rate (same assumption as the rest of the app).
 * - Price return over a period compares the latest close with the last close
 *   on or before the period start, so it reflects the investment itself,
 *   not money added or taken out.
 */

export interface PricePoint {
  date: ISODate;
  close: number;
}

export interface HoldingHistoryPoint {
  date: ISODate;
  price: number;
  units: number;
  value: number;
}

export function unitsOn(holding: Holding, transactions: Transaction[], date: ISODate): Decimal {
  let units = D(holding.opening_units);
  for (const t of transactions) {
    if (t.holding_id !== holding.id || t.occurred_on > date) continue;
    if (t.type === 'buy') units = units.plus(D(t.units));
    else if (t.type === 'sell') units = units.minus(D(t.units));
  }
  return Decimal.max(units, 0);
}

export function holdingHistory(
  holding: Holding,
  asset: Asset,
  account: Account,
  transactions: Transaction[],
  prices: PricePoint[],
  rates: FxRates,
): HoldingHistoryPoint[] {
  return [...prices]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => {
      const units = unitsOn(holding, transactions, p.date);
      const value = convert(units.times(D(p.close)), asset.currency, account.currency, rates) ?? units.times(D(p.close));
      return { date: p.date, price: p.close, units: units.toNumber(), value: value.toDecimalPlaces(2).toNumber() };
    });
}

export const RETURN_PERIODS = [
  { key: '1M', months: 1 },
  { key: '3M', months: 3 },
  { key: '6M', months: 6 },
  { key: '1Y', months: 12 },
  { key: '3Y', months: 36 },
  { key: '5Y', months: 60 },
] as const;

/**
 * First date we know the holding's units for: its first linked trade, or the
 * account's first valuation or opening date, whichever is earliest. Before
 * that, valuing today's units at old prices would be made up, so value
 * history starts here (price history can go back further).
 */
export function knownSince(holding: Holding, transactions: Transaction[], firstValuation: ISODate | null, openedOn: ISODate | null): ISODate | null {
  const dates = [firstValuation, openedOn, ...transactions.filter((t) => t.holding_id === holding.id).map((t) => t.occurred_on)].filter((d): d is ISODate => !!d);
  return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
}

/**
 * Price return from the period start to the latest close. Null when history
 * doesn't reach back to the period start.
 */
export function priceReturn(prices: PricePoint[], months: number): number | null {
  if (prices.length < 2) return null;
  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const start = addMonths(latest.date, -months);
  if (sorted[0].date > start) return null;
  let base: PricePoint | null = null;
  for (const p of sorted) {
    if (p.date <= start) base = p;
    else break;
  }
  if (!base || base.close === 0) return null;
  return D(latest.close).dividedBy(base.close).minus(1).toNumber();
}
