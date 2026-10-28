import type { AccountType } from '../types';
import { convertOrSame, type FxRates } from './fx';
import type { PortfolioModel } from './portfolio';

/**
 * Projection calculator. These are illustrations, not forecasts.
 *
 * Each pot (a holding, or an account valued without holdings) grows at a
 * fixed assumed yearly rate, less its yearly charges, compounded monthly.
 * Its monthly contribution is added at the end of each month. A second run
 * with no new contributions shows how much of the result comes from
 * paying in.
 */

export interface Pot {
  id: string;
  label: string;
  sub: string;
  /** Current value in GBP. */
  value: number;
  /** Monthly contribution in GBP. */
  monthly: number;
  /** Yearly charges in percent, e.g. 0.45 for 0.45%. */
  feePct: number;
}

export interface ProjectionPoint {
  year: number;
  /** With the monthly contributions. */
  plan: number;
  /** No new money. */
  noContributions: number;
  /** Today's value plus everything paid in. */
  paidIn: number;
}

export interface PotResult {
  pot: Pot;
  final: number;
  finalWithout: number;
  paidIn: number;
}

export interface Projection {
  points: ProjectionPoint[];
  pots: PotResult[];
  final: number;
  finalWithout: number;
  paidIn: number;
  monthlyTotal: number;
}

/** Monthly growth factor for a yearly growth rate (fraction) less yearly charges (percent). */
export function monthlyFactor(growth: number, feePct: number): number {
  const yearly = (1 + growth) * (1 - feePct / 100);
  return yearly > 0 ? Math.pow(yearly, 1 / 12) : 0;
}

export function project(pots: Pot[], { growth, years }: { growth: number; years: number }): Projection {
  const months = Math.max(0, Math.round(years * 12));
  const plan = pots.map((p) => p.value);
  const without = pots.map((p) => p.value);
  const factors = pots.map((p) => monthlyFactor(growth, p.feePct));
  const start = pots.reduce((s, p) => s + p.value, 0);
  const monthlyTotal = pots.reduce((s, p) => s + p.monthly, 0);

  const points: ProjectionPoint[] = [{ year: 0, plan: round(start), noContributions: round(start), paidIn: round(start) }];
  for (let m = 1; m <= months; m++) {
    for (let i = 0; i < pots.length; i++) {
      plan[i] = plan[i] * factors[i] + pots[i].monthly;
      without[i] = without[i] * factors[i];
    }
    if (m % 12 === 0 || m === months) {
      points.push({
        year: Math.round((m / 12) * 100) / 100,
        plan: round(plan.reduce((s, v) => s + v, 0)),
        noContributions: round(without.reduce((s, v) => s + v, 0)),
        paidIn: round(start + monthlyTotal * m),
      });
    }
  }

  return {
    points,
    pots: pots.map((pot, i) => ({ pot, final: round(plan[i]), finalWithout: round(without[i]), paidIn: round(pot.value + pot.monthly * months) })),
    final: round(plan.reduce((s, v) => s + v, 0)),
    finalWithout: round(without.reduce((s, v) => s + v, 0)),
    paidIn: round(start + monthlyTotal * months),
    monthlyTotal: round(monthlyTotal),
  };
}

const round = (v: number) => Math.round(v * 100) / 100;

/** Accounts that usually hold cash rather than investments; left out by default. */
export const CASH_LIKE: readonly AccountType[] = ['cash_savings', 'cash_isa', 'premium_bonds'];

export interface PotSource extends Omit<Pot, 'monthly'> {
  cashLike: boolean;
}

/**
 * Pots for the calculator: each holding in accounts valued from holdings
 * (plus their uninvested cash), and each other account as one pot, since
 * its recorded value is what counts.
 */
export function potsFromPortfolio(model: PortfolioModel, rates: FxRates): PotSource[] {
  const pots: PotSource[] = [];
  for (const m of model.activeAccounts) {
    const a = m.account;
    const platform = a.platform_fee_pct ?? 0;
    const cashLike = CASH_LIKE.includes(a.account_type);
    const live = m.positions.filter((p) => p.units > 0);
    if (m.valueSource === 'calculated' && live.length) {
      for (const p of live) {
        pots.push({
          id: `h:${p.holding.id}`,
          label: p.asset.name,
          sub: a.name,
          value: round(convertOrSame(p.valueForTotals, a.currency, 'GBP', rates).toNumber()),
          feePct: platform + (p.asset.ongoing_charge_pct ?? 0),
          cashLike,
        });
      }
      if (a.cash_balance > 0) {
        pots.push({ id: `c:${a.id}`, label: 'Uninvested cash', sub: a.name, value: round(convertOrSame(a.cash_balance, a.currency, 'GBP', rates).toNumber()), feePct: 0, cashLike: true });
      }
    } else if (m.currentValueBase > 0) {
      pots.push({ id: `a:${a.id}`, label: a.name, sub: a.provider ?? 'Whole account', value: round(m.currentValueBase), feePct: platform, cashLike });
    }
  }
  return pots;
}
