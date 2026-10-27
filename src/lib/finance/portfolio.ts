import { daysBetween, todayISO } from '../dates';
import { D, Decimal } from '../money';
import type { Account, Asset, Dataset, Holding, ISODate, MarketPrice, Snapshot, Transaction } from '../types';
import { alignSameDayFlows, cumulativeNet, toFlows, totalFlows, type Flow } from './flows';
import { convert, convertOrSame, type FxRates } from './fx';
import { computeHoldingPosition, type HoldingPosition } from './holdings';
import { computePerformance, periodPerformance, startingPoint, type PerformanceResult, type ValuePoint } from './performance';

/**
 * Builds the full calculated model from raw records. Pure and deterministic:
 * the same inputs always produce the same numbers on every page.
 *
 * Double-counting rules:
 * - Each account contributes exactly one value to the portfolio total. For
 *   'snapshot' accounts it is the latest snapshot; for 'holdings' accounts it
 *   is the sum of its holdings at market prices plus its cash balance.
 *   Holdings inside a snapshot-valued account are shown for information and
 *   compared against the snapshot, but are never added on top of it.
 * - Buys, sells, dividends, interest and fees are not contributions.
 * - Transfers between your own accounts are flows for each account but cancel
 *   out at portfolio level.
 */

export type ValueKind = 'actual' | 'calculated' | 'carried' | 'estimated';

export interface DatedValue {
  value: Decimal;
  kind: ValueKind;
}

export interface Discrepancy {
  snapshotValue: number;
  snapshotDate: ISODate;
  calculatedValue: number;
  difference: number;
  pct: number | null;
  significant: boolean;
}

export interface AccountModel {
  account: Account;
  snapshots: Snapshot[];
  latestSnapshot: Snapshot | null;
  positions: HoldingPosition[];
  holdingsValue: number;
  calculatedValue: number | null;
  currentValue: number;
  currentValueBase: number;
  valueSource: 'snapshot' | 'calculated' | 'none';
  valueDate: ISODate | null;
  discrepancy: Discrepancy | null;
  flows: Flow[];
  performance: PerformanceResult;
  fxMissing: boolean;
  valueAt: (date: ISODate) => DatedValue | null;
  /** Opening balance treated as capital when no earlier flows are recorded. */
  openingBalance: { date: ISODate; value: Decimal } | null;
}

export interface SeriesPoint {
  date: ISODate;
  value: number;
  /** Net external money in (contributions − withdrawals + opening balances). */
  invested: number;
  gain: number;
  estimated: boolean;
  /** Accounts whose value at this date is interpolated / estimated. */
  estimatedAccounts: string[];
}

export interface PortfolioModel {
  base: string;
  today: ISODate;
  accounts: AccountModel[];
  activeAccounts: AccountModel[];
  positions: HoldingPosition[];
  totalValue: number;
  contributions: number;
  withdrawals: number;
  netContributions: number;
  openingBalances: number;
  gain: number;
  performance: PerformanceResult;
  series: SeriesPoint[];
  /** Capital flows: external contributions/withdrawals plus opening balances. */
  flows: Flow[];
  /** Contributions and withdrawals only (no transfers, no opening balances). */
  externalFlows: Flow[];
  valueAt: (date: ISODate) => { value: number; estimated: boolean };
}

function sortSnapshots(snaps: Snapshot[]): Snapshot[] {
  return [...snaps].sort((a, b) => a.valued_on.localeCompare(b.valued_on) || a.created_at.localeCompare(b.created_at));
}

/** Last snapshot per date wins (later-created corrections). */
function snapshotPoints(snaps: Snapshot[]): ValuePoint[] {
  const byDate = new Map<ISODate, ValuePoint>();
  for (const s of sortSnapshots(snaps)) byDate.set(s.valued_on, { date: s.valued_on, value: D(s.value) });
  return [...byDate.values()];
}

/**
 * Value of an account on a date from its valuation points.
 * Between valuations the "growth" part (value − cumulative net flows) is
 * interpolated linearly and flows are added back, so a large deposit between
 * two snapshots shows up on the day it happened rather than being smeared.
 */
export function makeValueAt(points: ValuePoint[], flows: Flow[], pointKind: (p: ValuePoint) => ValueKind) {
  const start = startingPoint(points, flows);
  const pts: Array<ValuePoint & { synthetic?: boolean }> = [...points];
  if (start?.synthetic) pts.unshift({ date: start.date, value: start.value, synthetic: true });
  return (date: ISODate): DatedValue | null => {
    if (pts.length === 0 || date < pts[0].date) return null;
    let i = 0;
    while (i < pts.length && pts[i].date <= date) i++;
    const prev = pts[i - 1];
    if (prev.date === date) return { value: prev.value, kind: prev.synthetic ? 'estimated' : pointKind(prev) };
    const next = pts[i];
    const netPrev = cumulativeNet(flows, prev.date);
    const netNow = cumulativeNet(flows, date);
    if (!next) {
      const flowsSince = netNow.minus(netPrev);
      return { value: prev.value.plus(flowsSince), kind: flowsSince.isZero() ? 'carried' : 'estimated' };
    }
    const netNext = cumulativeNet(flows, next.date);
    const gPrev = prev.value.minus(netPrev);
    const gNext = next.value.minus(netNext);
    const t = daysBetween(prev.date, date) / daysBetween(prev.date, next.date);
    const v = gPrev.plus(gNext.minus(gPrev).times(t)).plus(netNow);
    return { value: v.isNegative() ? new Decimal(0) : v, kind: 'estimated' };
  };
}

export interface BuildInput {
  data: Dataset;
  prices: Record<string, MarketPrice>;
  rates: FxRates;
  base?: string;
  today?: ISODate;
}

export function buildAccountModel(
  account: Account,
  snapshots: Snapshot[],
  transactions: Transaction[],
  holdings: Holding[],
  assets: Map<string, Asset>,
  allTransactions: Transaction[],
  prices: Record<string, MarketPrice>,
  rates: FxRates,
  base: string,
  today: ISODate,
): AccountModel {
  const snaps = sortSnapshots(snapshots);
  const latestSnapshot = snaps.length
    ? snaps.reduce((a, b) => (b.valued_on > a.valued_on || (b.valued_on === a.valued_on && b.created_at >= a.created_at) ? b : a))
    : null;

  const positions: HoldingPosition[] = [];
  for (const h of holdings) {
    const asset = assets.get(h.asset_id);
    if (!asset) continue;
    positions.push(computeHoldingPosition(h, asset, account, allTransactions, asset.symbol ? prices[asset.symbol] : undefined, rates));
  }
  const holdingsValue = positions.reduce((s, p) => s.plus(p.valueForTotals), new Decimal(0));
  const calculated = account.valuation_mode === 'holdings' ? holdingsValue.plus(D(account.cash_balance)) : null;

  const flows = alignSameDayFlows(toFlows(transactions, 'account'), snaps);
  const points = snapshotPoints(snaps);
  if (calculated) {
    // Today's calculated value replaces any snapshot recorded today.
    const idx = points.findIndex((p) => p.date === today);
    const pt = { date: today, value: calculated };
    if (idx >= 0) points[idx] = pt;
    else if (points.length === 0 || points[points.length - 1].date < today) points.push(pt);
  }

  const performance = computePerformance(points, flows);
  const valueAt = makeValueAt(points, flows, (p) => (calculated && p.date === today ? 'calculated' : 'actual'));

  let currentValue: Decimal;
  let valueSource: AccountModel['valueSource'];
  let valueDate: ISODate | null;
  if (calculated) {
    currentValue = calculated;
    valueSource = 'calculated';
    valueDate = today;
  } else if (latestSnapshot) {
    currentValue = D(performance.currentValue);
    valueSource = 'snapshot';
    valueDate = latestSnapshot.valued_on;
  } else {
    currentValue = new Decimal(0);
    valueSource = 'none';
    valueDate = null;
  }

  let discrepancy: Discrepancy | null = null;
  if (latestSnapshot && positions.length > 0) {
    const calcValue = holdingsValue.plus(D(account.cash_balance));
    const diff = calcValue.minus(D(latestSnapshot.value));
    const pct = D(latestSnapshot.value).isZero() ? null : diff.dividedBy(D(latestSnapshot.value)).toNumber();
    const age = daysBetween(latestSnapshot.valued_on, today);
    discrepancy = {
      snapshotValue: latestSnapshot.value,
      snapshotDate: latestSnapshot.valued_on,
      calculatedValue: calcValue.toDecimalPlaces(2).toNumber(),
      difference: diff.toDecimalPlaces(2).toNumber(),
      pct,
      significant: age <= 31 && pct != null && Math.abs(pct) > 0.05,
    };
  }

  const converted = convert(currentValue, account.currency, base, rates);
  const start = startingPoint(points, flows);
  const openingBalance = start && !start.fullHistory && start.value.greaterThan(0) ? { date: start.date, value: start.value } : null;

  return {
    account,
    snapshots: snaps,
    latestSnapshot,
    positions,
    holdingsValue: holdingsValue.toDecimalPlaces(2).toNumber(),
    calculatedValue: calculated ? calculated.toDecimalPlaces(2).toNumber() : null,
    currentValue: currentValue.toDecimalPlaces(2).toNumber(),
    currentValueBase: (converted ?? currentValue).toDecimalPlaces(2).toNumber(),
    valueSource,
    valueDate,
    discrepancy,
    flows,
    performance,
    fxMissing: converted == null,
    valueAt,
    openingBalance,
  };
}

export function buildPortfolio({ data, prices, rates, base = 'GBP', today = todayISO() }: BuildInput): PortfolioModel {
  const assets = new Map(data.assets.map((a) => [a.id, a]));
  const byAccount = <T extends { account_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.account_id, [...(m.get(r.account_id) ?? []), r]);
    return m;
  };
  const snapsBy = byAccount(data.snapshots);
  const txBy = byAccount(data.transactions);
  const holdBy = byAccount(data.holdings);

  const accounts = data.accounts.map((a) =>
    buildAccountModel(a, snapsBy.get(a.id) ?? [], txBy.get(a.id) ?? [], holdBy.get(a.id) ?? [], assets, data.transactions, prices, rates, base, today),
  );
  const currencyOf = new Map(data.accounts.map((a) => [a.id, a.currency]));
  const toBase = (amount: Decimal, accountId: string) => convertOrSame(amount, currencyOf.get(accountId) ?? base, base, rates);

  // Portfolio-scope flows (transfers excluded), in base currency.
  const flows = alignSameDayFlows(toFlows(data.transactions, 'portfolio', toBase), data.snapshots);
  const totals = totalFlows(flows);

  // Opening balances act as capital invested at the account's first valuation.
  const openingFlows: Flow[] = accounts
    .filter((m) => m.openingBalance)
    .map((m) => ({ date: m.openingBalance!.date, amount: toBase(m.openingBalance!.value, m.account.id) }));
  const capitalFlows = [...flows, ...openingFlows].sort((a, b) => a.date.localeCompare(b.date));
  const openingBalances = openingFlows.reduce((s, f) => s.plus(f.amount), new Decimal(0));

  const valueAtDetailed = (date: ISODate) => {
    let total = new Decimal(0);
    const estimatedAccounts: string[] = [];
    for (const m of accounts) {
      const v = m.valueAt(date);
      if (!v) continue;
      total = total.plus(toBase(v.value, m.account.id));
      if (v.kind === 'estimated') estimatedAccounts.push(m.account.name);
    }
    return { total, estimatedAccounts };
  };

  // Series dates: every valuation date of every account plus today.
  const dateSet = new Set<ISODate>([today]);
  for (const m of accounts) for (const s of m.snapshots) if (s.valued_on <= today) dateSet.add(s.valued_on);
  const dates = [...dateSet].sort();

  const series: SeriesPoint[] = [];
  for (const date of dates) {
    const { total, estimatedAccounts } = valueAtDetailed(date);
    const invested = cumulativeNet(capitalFlows, date);
    if (total.isZero() && invested.isZero() && series.length === 0) continue;
    series.push({
      date,
      value: total.toDecimalPlaces(2).toNumber(),
      invested: invested.toDecimalPlaces(2).toNumber(),
      gain: total.minus(invested).toDecimalPlaces(2).toNumber(),
      estimated: estimatedAccounts.length > 0,
      estimatedAccounts,
    });
  }

  const seriesPoints: ValuePoint[] = series.map((p) => ({ date: p.date, value: D(p.value), estimated: p.estimated }));
  const performance = computePerformance(seriesPoints, capitalFlows);

  const totalValue = accounts.reduce((s, m) => s.plus(m.currentValueBase), new Decimal(0));
  const gain = totalValue.plus(totals.withdrawals).minus(totals.contributions).minus(openingBalances);

  return {
    base,
    today,
    accounts,
    activeAccounts: accounts.filter((m) => !m.account.is_archived),
    positions: accounts.flatMap((m) => m.positions),
    totalValue: totalValue.toDecimalPlaces(2).toNumber(),
    contributions: totals.contributions.toDecimalPlaces(2).toNumber(),
    withdrawals: totals.withdrawals.toDecimalPlaces(2).toNumber(),
    netContributions: totals.net.toDecimalPlaces(2).toNumber(),
    openingBalances: openingBalances.toDecimalPlaces(2).toNumber(),
    gain: gain.toDecimalPlaces(2).toNumber(),
    performance,
    series,
    flows: capitalFlows,
    externalFlows: flows,
    valueAt: (date) => {
      const r = valueAtDetailed(date);
      return { value: r.total.toDecimalPlaces(2).toNumber(), estimated: r.estimatedAccounts.length > 0 };
    },
  };
}

/** Slice the portfolio series to a period, adding an interpolated start point. */
export function seriesForPeriod(model: PortfolioModel, from: ISODate | null): SeriesPoint[] {
  if (!from) return model.series;
  const inside = model.series.filter((p) => p.date >= from);
  if (model.series.length === 0 || model.series[0].date >= from) return inside;
  if (inside.length > 0 && inside[0].date === from) return inside;
  const v = model.valueAt(from);
  const invested = cumulativeNet(model.flows, from).toDecimalPlaces(2).toNumber();
  return [{ date: from, value: v.value, invested, gain: v.value - invested, estimated: v.estimated, estimatedAccounts: [] }, ...inside];
}

export function periodSummary(model: PortfolioModel, from: ISODate | null) {
  const pts = seriesForPeriod(model, from);
  return periodPerformance(
    pts.map((p) => ({ date: p.date, value: D(p.value), estimated: p.estimated })),
    model.flows,
    null,
  );
}

/** Chart series for one account: recorded valuations plus today's value. */
export function accountSeries(m: AccountModel, today: ISODate): SeriesPoint[] {
  const capital = [...m.flows];
  if (m.openingBalance) capital.push({ date: m.openingBalance.date, amount: m.openingBalance.value });
  capital.sort((a, b) => a.date.localeCompare(b.date));
  const dates = new Set<ISODate>(m.snapshots.map((s) => s.valued_on).filter((d) => d <= today));
  if (m.valueSource !== 'none') dates.add(today);
  return [...dates].sort().flatMap((date) => {
    const v = m.valueAt(date);
    if (!v) return [];
    const invested = cumulativeNet(capital, date);
    return [
      {
        date,
        value: v.value.toDecimalPlaces(2).toNumber(),
        invested: invested.toDecimalPlaces(2).toNumber(),
        gain: v.value.minus(invested).toDecimalPlaces(2).toNumber(),
        estimated: v.kind === 'estimated',
        estimatedAccounts: v.kind === 'estimated' ? [m.account.name] : [],
      },
    ];
  });
}
