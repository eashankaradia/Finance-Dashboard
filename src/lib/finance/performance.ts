import { addDays, daysBetween } from '../dates';
import { Decimal } from '../money';
import type { ISODate } from '../types';
import type { Flow } from './flows';

/**
 * Performance methodology (used identically for accounts and the portfolio).
 *
 * Inputs are valuation points (dated values) and signed external cash flows.
 *
 * 1. Starting point (see startingPoint)
 *    - If any flow is dated before the first valuation, the flow history is
 *      assumed complete: the starting value is £0 and every flow counts.
 *    - Otherwise the first valuation, less any flows on that same day, is the
 *      opening balance and only flows from that day on count.
 *
 * 2. Investment gain/loss (simple, money terms)
 *      gain = current value + withdrawals − contributions − starting value
 *
 * 3. Time-weighted return (TWR)
 *    Valuations split history into sub-periods. Each sub-period return uses
 *    Modified Dietz (flows weighted by the fraction of the period they were
 *    invested) and sub-period returns are chain-linked:
 *      r_i = (V_end − V_start − F) / (V_start + Σ w_j·f_j)
 *    Convention: valuations are end-of-day and flows happen at the start of
 *    their day, so a flow on day d in (t0, t1] is invested for
 *    (t1 − d + 1) days: w_j = (t1 − d + 1) / (t1 − t0).
 *      TWR = Π(1 + r_i) − 1
 *    This equals a true TWR when valuations exist at every flow date and is a
 *    close approximation otherwise; it is flagged as an estimate when large
 *    flows fall inside long sub-periods or any valuation was interpolated.
 *
 * 4. Money-weighted return (XIRR)
 *    The annualised rate r solving Σ CF_i / (1 + r)^(t_i/365) = 0 where the
 *    starting value and contributions are outflows from you and withdrawals
 *    and the current value are inflows to you.
 */

export interface ValuePoint {
  date: ISODate;
  value: Decimal;
  /** true when the value was interpolated or carried forward, not recorded. */
  estimated?: boolean;
}

export type Reliability = 'ok' | 'estimate' | 'unavailable';

export interface ReturnResult {
  value: number | null;
  annualised: number | null;
  reliability: Reliability;
  reason?: string;
}

export interface PerformanceResult {
  startDate: ISODate | null;
  endDate: ISODate | null;
  startValue: number;
  currentValue: number;
  contributions: number;
  withdrawals: number;
  netContributions: number;
  gain: number;
  /** gain / (starting value + contributions). Shown only as a simple ratio. */
  simpleReturn: number | null;
  twr: ReturnResult;
  xirr: ReturnResult;
  /** Flows dated after the last valuation (assumed to be at zero return). */
  flowsAfterLastValuation: number;
  assumptions: string[];
}

export interface StartingPoint {
  date: ISODate;
  value: Decimal;
  /** true when the start is derived rather than a recorded valuation. */
  synthetic: boolean;
  fullHistory: boolean;
}

/** Where measurement starts. Shared by performance and chart interpolation. */
export function startingPoint(points: ValuePoint[], flows: Flow[]): StartingPoint | null {
  const pts = dedupePoints(points);
  if (pts.length === 0) return null;
  const first = pts[0];
  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length > 0 && sorted[0].date < first.date) {
    // Day before the first flow, so that flow is fully weighted.
    return { date: addDays(sorted[0].date, -1), value: new Decimal(0), synthetic: true, fullHistory: true };
  }
  const sameDay = sorted.filter((f) => f.date === first.date).reduce((s, f) => s.plus(f.amount), new Decimal(0));
  if (sameDay.isZero()) return { date: first.date, value: first.value, synthetic: false, fullHistory: false };
  // Flows on the first valuation day are inside that valuation: what was
  // there before them is the opening balance (the day before).
  const opening = Decimal.max(first.value.minus(sameDay), 0);
  return { date: addDays(first.date, -1), value: opening, synthetic: true, fullHistory: false };
}

const UNAVAILABLE = (reason: string): ReturnResult => ({ value: null, annualised: null, reliability: 'unavailable', reason });

function dedupePoints(points: ValuePoint[]): ValuePoint[] {
  const byDate = new Map<ISODate, ValuePoint>();
  for (const p of [...points].sort((a, b) => a.date.localeCompare(b.date))) byDate.set(p.date, p);
  return [...byDate.values()];
}

export function computePerformance(rawPoints: ValuePoint[], rawFlows: Flow[]): PerformanceResult {
  const points = dedupePoints(rawPoints);
  const flows = [...rawFlows].sort((a, b) => a.date.localeCompare(b.date));
  const assumptions: string[] = [];

  if (points.length === 0) {
    const c = flows.filter((f) => f.amount.isPositive()).reduce((s, f) => s.plus(f.amount), new Decimal(0));
    const w = flows.filter((f) => f.amount.isNegative()).reduce((s, f) => s.plus(f.amount.abs()), new Decimal(0));
    return {
      startDate: flows[0]?.date ?? null,
      endDate: null,
      startValue: 0,
      currentValue: 0,
      contributions: c.toDecimalPlaces(2).toNumber(),
      withdrawals: w.toDecimalPlaces(2).toNumber(),
      netContributions: c.minus(w).toDecimalPlaces(2).toNumber(),
      gain: 0,
      simpleReturn: null,
      twr: UNAVAILABLE('No valuations recorded yet'),
      xirr: UNAVAILABLE('No valuations recorded yet'),
      flowsAfterLastValuation: 0,
      assumptions: ['No valuation has been recorded, so performance cannot be measured.'],
    };
  }

  const last = points[points.length - 1];
  const start = startingPoint(points, flows)!;
  const startDate = start.date;
  const startValue = start.value;
  const counted = flows.filter((f) => f.date > startDate);
  const periodPoints: ValuePoint[] = [{ date: startDate, value: startValue, estimated: start.synthetic }, ...points.filter((p) => p.date > startDate)];
  if (start.fullHistory) {
    assumptions.push('Starting value is £0: contributions are recorded from before the first valuation.');
  } else if (startValue.greaterThan(0)) {
    assumptions.push(
      start.synthetic
        ? 'The first valuation, less contributions made that day, is treated as the opening balance; earlier contributions are not known.'
        : 'The first recorded valuation is treated as the opening balance; earlier contributions are not known.',
    );
  }
  const upToLast = counted.filter((f) => f.date <= last.date);
  const afterLast = counted.filter((f) => f.date > last.date);
  const afterLastNet = afterLast.reduce((s, f) => s.plus(f.amount), new Decimal(0));
  if (afterLast.length > 0) {
    assumptions.push('Contributions or withdrawals after the latest valuation are added to the value at zero return until a new valuation is recorded.');
  }

  const contributions = counted.filter((f) => f.amount.isPositive()).reduce((s, f) => s.plus(f.amount), new Decimal(0));
  const withdrawals = counted.filter((f) => f.amount.isNegative()).reduce((s, f) => s.plus(f.amount.abs()), new Decimal(0));
  const currentValue = last.value.plus(afterLastNet);
  const gain = currentValue.plus(withdrawals).minus(contributions).minus(startValue);
  const capital = startValue.plus(contributions);
  const simpleReturn = capital.isZero() ? null : gain.dividedBy(capital).toNumber();

  return {
    startDate,
    endDate: last.date,
    startValue: startValue.toDecimalPlaces(2).toNumber(),
    currentValue: currentValue.toDecimalPlaces(2).toNumber(),
    contributions: contributions.toDecimalPlaces(2).toNumber(),
    withdrawals: withdrawals.toDecimalPlaces(2).toNumber(),
    netContributions: contributions.minus(withdrawals).toDecimalPlaces(2).toNumber(),
    gain: gain.toDecimalPlaces(2).toNumber(),
    simpleReturn,
    twr: timeWeightedReturn(periodPoints, upToLast),
    xirr: xirrFromHistory(startDate, startValue, upToLast, last),
    flowsAfterLastValuation: afterLastNet.toDecimalPlaces(2).toNumber(),
    assumptions,
  };
}

/** Chain-linked Modified Dietz time-weighted return. */
export function timeWeightedReturn(points: ValuePoint[], flows: Flow[]): ReturnResult {
  const pts = dedupePoints(points);
  if (pts.length < 2) return UNAVAILABLE('At least two valuations are needed');

  let growth = new Decimal(1);
  let estimate = pts.some((p) => p.estimated);
  let usedPeriods = 0;
  let skipped = 0;

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const T = daysBetween(a.date, b.date);
    if (T <= 0) continue;
    const inPeriod = flows.filter((f) => f.date > a.date && f.date <= b.date);
    let F = new Decimal(0);
    let weighted = new Decimal(0);
    for (const f of inPeriod) {
      F = F.plus(f.amount);
      weighted = weighted.plus(f.amount.times(daysBetween(f.date, b.date) + 1).dividedBy(T));
    }
    const denom = a.value.plus(weighted);
    if (denom.lessThanOrEqualTo(0)) {
      // Nothing invested during this sub-period (e.g. account emptied).
      if (!b.value.isZero() || !F.isZero()) skipped++;
      continue;
    }
    const r = b.value.minus(a.value).minus(F).dividedBy(denom);
    growth = growth.times(r.plus(1));
    usedPeriods++;
    // Large flows inside long sub-periods make Modified Dietz less precise.
    if (T > 45 && !a.value.isZero() && F.abs().dividedBy(a.value).greaterThan(0.3)) estimate = true;
  }

  if (usedPeriods === 0) return UNAVAILABLE('Not enough invested history between valuations');
  if (skipped > 0) estimate = true;

  const value = growth.minus(1).toNumber();
  const days = daysBetween(pts[0].date, pts[pts.length - 1].date);
  const annualised = days >= 365 ? growth.pow(new Decimal(365).dividedBy(days)).minus(1).toNumber() : null;
  return {
    value,
    annualised,
    reliability: estimate ? 'estimate' : 'ok',
    reason: estimate ? 'Some valuations are interpolated or far apart around large cash flows' : undefined,
  };
}

export interface DatedCashFlow {
  date: ISODate;
  /** Investor perspective: negative = paid in, positive = received. */
  amount: number;
}

function xnpv(rate: number, cfs: DatedCashFlow[]): number {
  const t0 = cfs[0].date;
  return cfs.reduce((s, cf) => s + cf.amount / Math.pow(1 + rate, daysBetween(t0, cf.date) / 365), 0);
}

function dxnpv(rate: number, cfs: DatedCashFlow[]): number {
  const t0 = cfs[0].date;
  return cfs.reduce((s, cf) => {
    const t = daysBetween(t0, cf.date) / 365;
    return s - (t * cf.amount) / Math.pow(1 + rate, t + 1);
  }, 0);
}

/** Annualised internal rate of return for irregular cash flows. */
export function xirr(cashFlows: DatedCashFlow[]): number | null {
  const cfs = [...cashFlows].filter((c) => c.amount !== 0).sort((a, b) => a.date.localeCompare(b.date));
  if (cfs.length < 2) return null;
  if (!cfs.some((c) => c.amount > 0) || !cfs.some((c) => c.amount < 0)) return null;

  // Newton–Raphson first.
  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = xnpv(rate, cfs);
    const df = dxnpv(rate, cfs);
    if (!Number.isFinite(f) || !Number.isFinite(df) || df === 0) break;
    const next = rate - f / df;
    if (next <= -0.999999) break;
    if (Math.abs(next - rate) < 1e-10) return next;
    rate = next;
  }

  // Fall back to bisection on a wide bracket.
  let lo = -0.9999;
  let hi = 10;
  let flo = xnpv(lo, cfs);
  const fhi = xnpv(hi, cfs);
  if (Number.isNaN(flo) || Number.isNaN(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fm = xnpv(mid, cfs);
    if (Math.abs(fm) < 1e-9 || hi - lo < 1e-12) return mid;
    if (flo * fm < 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

function xirrFromHistory(startDate: ISODate, startValue: Decimal, flows: Flow[], last: ValuePoint): ReturnResult {
  const span = daysBetween(startDate, last.date);
  if (span < 30) return UNAVAILABLE('Less than a month of history');
  const cfs: DatedCashFlow[] = [];
  if (startValue.greaterThan(0)) cfs.push({ date: startDate, amount: -startValue.toNumber() });
  for (const f of flows) cfs.push({ date: f.date, amount: -f.amount.toNumber() });
  cfs.push({ date: last.date, amount: last.value.toNumber() });
  const r = xirr(cfs);
  if (r == null) return UNAVAILABLE('Cash flows do not produce a unique rate');
  return {
    value: r,
    annualised: r,
    reliability: span < 365 || last.estimated ? 'estimate' : 'ok',
    reason: span < 365 ? 'Annualised from less than a year of data' : last.estimated ? 'Latest value is estimated' : undefined,
  };
}

/** Return over a window [from, to] of an already-built value series. */
export function periodPerformance(series: ValuePoint[], flows: Flow[], from: ISODate | null): {
  startValue: number;
  endValue: number;
  netFlows: number;
  gain: number;
  twr: ReturnResult;
} | null {
  const pts = dedupePoints(series);
  if (pts.length === 0) return null;
  const windowPts = from ? pts.filter((p) => p.date >= from) : pts;
  if (windowPts.length === 0) return null;
  const startPoint = windowPts[0];
  const endPoint = windowPts[windowPts.length - 1];
  const windowFlows = flows.filter((f) => f.date > startPoint.date && f.date <= endPoint.date);
  const net = windowFlows.reduce((s, f) => s.plus(f.amount), new Decimal(0));
  const gain = endPoint.value.minus(startPoint.value).minus(net);
  return {
    startValue: startPoint.value.toDecimalPlaces(2).toNumber(),
    endValue: endPoint.value.toDecimalPlaces(2).toNumber(),
    netFlows: net.toDecimalPlaces(2).toNumber(),
    gain: gain.toDecimalPlaces(2).toNumber(),
    twr: timeWeightedReturn(windowPts, windowFlows),
  };
}
