import { D, Decimal } from '../money';
import { addDays } from '../dates';
import type { ISODate, Snapshot, Transaction, TransactionType } from '../types';

/**
 * Cash-flow classification. This is the single source of truth for which
 * transactions count as money entering or leaving an account / the portfolio.
 *
 * Account scope: deposits, withdrawals AND transfers between your own accounts
 * are external flows for the individual account (money really did arrive in or
 * leave that account).
 *
 * Portfolio scope: only deposits and withdrawals are external. Transfers move
 * money between two of your own accounts, so the two legs cancel and must not
 * be counted as new contributions or withdrawals.
 *
 * Buys, sells, dividends, interest, fees and adjustments never count as
 * external flows: they happen inside an account and are part of investment
 * performance (or trading activity), not money you put in or took out.
 */
export type FlowScope = 'account' | 'portfolio';

export interface Flow {
  date: ISODate;
  /** Signed: positive = money in (contribution), negative = money out. */
  amount: Decimal;
  accountId?: string;
  createdAt?: string;
}

export function flowSign(type: TransactionType, scope: FlowScope): 1 | -1 | 0 {
  switch (type) {
    case 'deposit':
      return 1;
    case 'withdrawal':
      return -1;
    case 'transfer_in':
      return scope === 'account' ? 1 : 0;
    case 'transfer_out':
      return scope === 'account' ? -1 : 0;
    default:
      return 0;
  }
}

export function isExternalFlow(type: TransactionType, scope: FlowScope): boolean {
  return flowSign(type, scope) !== 0;
}

export function toFlows(transactions: Transaction[], scope: FlowScope, convert: (amount: Decimal, accountId: string) => Decimal = (a) => a): Flow[] {
  const flows: Flow[] = [];
  for (const tx of transactions) {
    const sign = flowSign(tx.type, scope);
    if (sign === 0) continue;
    flows.push({ date: tx.occurred_on, amount: convert(D(tx.amount).abs().times(sign), tx.account_id), accountId: tx.account_id, createdAt: tx.created_at });
  }
  return flows.sort((a, b) => a.date.localeCompare(b.date));
}

export interface FlowTotals {
  contributions: Decimal;
  withdrawals: Decimal;
  net: Decimal;
}

export function totalFlows(flows: Flow[], from?: ISODate | null, to?: ISODate | null): FlowTotals {
  let contributions = new Decimal(0);
  let withdrawals = new Decimal(0);
  for (const f of flows) {
    if (from && f.date <= from) continue;
    if (to && f.date > to) continue;
    if (f.amount.isPositive()) contributions = contributions.plus(f.amount);
    else withdrawals = withdrawals.plus(f.amount.abs());
  }
  return { contributions, withdrawals, net: contributions.minus(withdrawals) };
}

/** Cumulative net flow up to and including `date`. */
export function cumulativeNet(flows: Flow[], date: ISODate): Decimal {
  let total = new Decimal(0);
  for (const f of flows) {
    if (f.date > date) break;
    total = total.plus(f.amount);
  }
  return total;
}

export interface PeriodTotal {
  key: string;
  contributions: number;
  withdrawals: number;
  net: number;
}

/** Group flows by month ('YYYY-MM') or year ('YYYY'). */
export function groupFlows(flows: Flow[], by: 'month' | 'year'): PeriodTotal[] {
  const map = new Map<string, { c: Decimal; w: Decimal }>();
  for (const f of flows) {
    const key = by === 'month' ? f.date.slice(0, 7) : f.date.slice(0, 4);
    const entry = map.get(key) ?? { c: new Decimal(0), w: new Decimal(0) };
    if (f.amount.isPositive()) entry.c = entry.c.plus(f.amount);
    else entry.w = entry.w.plus(f.amount.abs());
    map.set(key, entry);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { c, w }]) => ({
      key,
      contributions: c.toDecimalPlaces(2).toNumber(),
      withdrawals: w.toDecimalPlaces(2).toNumber(),
      net: c.minus(w).toDecimalPlaces(2).toNumber(),
    }));
}

/**
 * Same-day ordering. Flows are normally treated as happening at the start of
 * their day, i.e. already included in a valuation dated that day. When a
 * flow was recorded *after* the valuation it shares a date with (e.g. you
 * entered today's value, then today's contribution), it cannot be in that
 * valuation, so it is moved to the following day for the calculations.
 */
export function alignSameDayFlows(flows: Flow[], snapshots: Snapshot[]): Flow[] {
  const effective = new Map<string, Snapshot>();
  for (const s of snapshots) {
    const key = `${s.account_id}|${s.valued_on}`;
    const cur = effective.get(key);
    if (!cur || s.created_at >= cur.created_at) effective.set(key, s);
  }
  return flows
    .map((f) => {
      const snap = f.accountId ? effective.get(`${f.accountId}|${f.date}`) : undefined;
      return snap && f.createdAt && f.createdAt > snap.created_at ? { ...f, date: addDays(f.date, 1) } : f;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
