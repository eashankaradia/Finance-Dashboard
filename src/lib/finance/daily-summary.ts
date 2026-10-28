import { addDays } from '../dates';
import { D, Decimal } from '../money';
import type { Dataset, ISODate, MarketPrice, Snapshot, Transaction } from '../types';
import { convert, type FxRates } from './fx';
import type { HoldingPosition } from './holdings';
import { periodSummary, type PortfolioModel } from './portfolio';

/**
 * "Today" summary.
 *
 * - Day move per holding = units × the provider's change since the previous
 *   close (in the quote currency), converted to GBP. Only holdings priced
 *   from the market have one; manual and cost-valued holdings don't move.
 * - Holdings total move % = total move / (current value − total move).
 * - Week and month figures use the portfolio's value history, net of money
 *   paid in or taken out, like the rest of the app.
 */

export interface HoldingMove {
  position: HoldingPosition;
  /** Day move in GBP. */
  change: number;
  changePct: number | null;
  value: number;
  priceDate: ISODate | null;
}

export interface DailySummary {
  today: ISODate;
  totalValue: number;
  holdingsChange: number | null;
  holdingsChangePct: number | null;
  /** Latest price date among the movers (funds are often a day behind). */
  pricesAsOf: ISODate | null;
  movers: HoldingMove[];
  unmoved: HoldingPosition[];
  week: { gain: number; twr: number | null } | null;
  month: { gain: number; twr: number | null } | null;
  transactions: Transaction[];
  snapshots: Snapshot[];
}

export function dailySummary(model: PortfolioModel, data: Dataset, prices: Record<string, MarketPrice>, rates: FxRates): DailySummary {
  const today = model.today;
  const toGbp = (v: Decimal, ccy: string) => convert(v, ccy, 'GBP', rates) ?? v;

  const movers: HoldingMove[] = [];
  const unmoved: HoldingPosition[] = [];
  let total = new Decimal(0);
  let totalValue = new Decimal(0);
  for (const p of model.positions) {
    if (p.units <= 0 || p.account.is_archived) continue;
    const mp = p.asset.symbol ? prices[p.asset.symbol.toUpperCase()] ?? prices[p.asset.symbol] : undefined;
    if (p.price.source !== 'market' || !mp || mp.change == null) {
      unmoved.push(p);
      continue;
    }
    const change = toGbp(D(p.units).times(D(mp.change)), p.price.currency);
    const value = toGbp(D(p.marketValue ?? 0), p.account.currency);
    total = total.plus(change);
    totalValue = totalValue.plus(value);
    movers.push({
      position: p,
      change: change.toDecimalPlaces(2).toNumber(),
      changePct: mp.change_pct,
      value: value.toDecimalPlaces(2).toNumber(),
      priceDate: mp.as_of ? mp.as_of.slice(0, 10) : null,
    });
  }
  movers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const prev = totalValue.minus(total);

  const period = (from: ISODate) => {
    const s = periodSummary(model, from);
    return s ? { gain: s.gain, twr: s.twr.value } : null;
  };

  return {
    today,
    totalValue: model.totalValue,
    holdingsChange: movers.length ? total.toDecimalPlaces(2).toNumber() : null,
    holdingsChangePct: movers.length && !prev.isZero() ? total.dividedBy(prev).toNumber() : null,
    pricesAsOf: movers.reduce<ISODate | null>((d, m) => (m.priceDate && (!d || m.priceDate > d) ? m.priceDate : d), null),
    movers,
    unmoved,
    week: period(addDays(today, -7)),
    month: period(addDays(today, -30)),
    transactions: data.transactions.filter((t) => t.occurred_on === today).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    snapshots: data.snapshots.filter((s) => s.valued_on === today && s.notes !== 'Automatic daily valuation'),
  };
}
