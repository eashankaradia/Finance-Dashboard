import { D, Decimal } from '../money';
import type { Account, Dataset, ISODate, Transaction } from '../types';
import { convertOrSame, type FxRates } from './fx';
import type { HoldingPosition } from './holdings';
import { taxYearOf } from './isa';
import type { PortfolioModel } from './portfolio';

/**
 * Fees view.
 *
 * - Recorded fees: 'fee' transactions plus dealing fees on buys and sells,
 *   in GBP, by tax year and by account.
 * - Estimated yearly charges from the current values: each fund's ongoing
 *   charge (OCF) × its value, plus each account's platform fee × the
 *   account's value. These are estimates; providers charge on daily or
 *   monthly average values and some cap their fees.
 */

export interface FeeItem {
  tx: Transaction;
  account: Account;
  amount: number;
  kind: 'fee' | 'dealing';
}

export interface ChargeLine {
  key: string;
  label: string;
  sub: string;
  value: number;
  pct: number;
  yearly: number;
}

export interface FeesSummary {
  items: FeeItem[];
  total: number;
  thisYear: number;
  thisYearLabel: string;
  byYear: { label: string; total: number }[];
  byAccount: { account: Account; total: number; thisYear: number }[];
  fundCharges: ChargeLine[];
  platformCharges: ChargeLine[];
  estimatedYearly: number;
  /** Estimated yearly charges as a share of the whole portfolio. */
  estimatedPct: number | null;
  /** Holdings with a value but no ongoing charge entered. */
  missingOcf: HoldingPosition[];
  /** Investment accounts with no platform fee entered. */
  missingPlatform: Account[];
}

const INVESTMENT_TYPES = new Set(['stocks_shares_isa', 'lifetime_isa', 'sipp', 'gia', 'workplace_pension']);

export function feesSummary(model: PortfolioModel, data: Dataset, rates: FxRates, today: ISODate): FeesSummary {
  const accounts = new Map(data.accounts.map((a) => [a.id, a]));
  const gbp = (v: number | Decimal, ccy: string) => convertOrSame(v, ccy, 'GBP', rates);

  const items: FeeItem[] = [];
  for (const t of data.transactions) {
    const account = accounts.get(t.account_id);
    if (!account) continue;
    if (t.type === 'fee' && t.amount > 0) items.push({ tx: t, account, amount: gbp(t.amount, account.currency).toDecimalPlaces(2).toNumber(), kind: 'fee' });
    if ((t.type === 'buy' || t.type === 'sell') && t.fees && t.fees > 0)
      items.push({ tx: t, account, amount: gbp(t.fees, account.currency).toDecimalPlaces(2).toNumber(), kind: 'dealing' });
  }
  items.sort((a, b) => b.tx.occurred_on.localeCompare(a.tx.occurred_on));

  const current = taxYearOf(today).label;
  const byYear = new Map<string, Decimal>();
  const byAccount = new Map<string, { account: Account; total: Decimal; thisYear: Decimal }>();
  let total = new Decimal(0);
  for (const i of items) {
    const label = taxYearOf(i.tx.occurred_on).label;
    total = total.plus(i.amount);
    byYear.set(label, (byYear.get(label) ?? new Decimal(0)).plus(i.amount));
    const row = byAccount.get(i.account.id) ?? { account: i.account, total: new Decimal(0), thisYear: new Decimal(0) };
    row.total = row.total.plus(i.amount);
    if (label === current) row.thisYear = row.thisYear.plus(i.amount);
    byAccount.set(i.account.id, row);
  }

  // Estimated ongoing charges on today's values.
  const fundCharges: ChargeLine[] = [];
  const missingOcf: HoldingPosition[] = [];
  for (const p of model.positions) {
    if (p.units <= 0 || p.account.is_archived || p.asset.asset_type === 'cash') continue;
    const value = gbp(p.valueForTotals, p.account.currency);
    if (value.lte(0)) continue;
    const pct = p.asset.ongoing_charge_pct;
    if (pct == null) {
      if (p.asset.asset_type === 'fund' || p.asset.asset_type === 'etf' || p.asset.asset_type === 'investment_trust') missingOcf.push(p);
      continue;
    }
    fundCharges.push({
      key: p.holding.id,
      label: p.asset.name,
      sub: p.account.name,
      value: value.toDecimalPlaces(2).toNumber(),
      pct,
      yearly: value.times(pct).dividedBy(100).toDecimalPlaces(2).toNumber(),
    });
  }

  const platformCharges: ChargeLine[] = [];
  const missingPlatform: Account[] = [];
  for (const m of model.activeAccounts) {
    const pct = m.account.platform_fee_pct;
    if (pct == null) {
      if (INVESTMENT_TYPES.has(m.account.account_type) && m.currentValueBase > 0) missingPlatform.push(m.account);
      continue;
    }
    platformCharges.push({
      key: m.account.id,
      label: m.account.name,
      sub: m.account.provider ?? '',
      value: m.currentValueBase,
      pct,
      yearly: D(m.currentValueBase).times(pct).dividedBy(100).toDecimalPlaces(2).toNumber(),
    });
  }

  const yearly = [...fundCharges, ...platformCharges].reduce((s, c) => s.plus(c.yearly), new Decimal(0));

  return {
    items,
    total: total.toDecimalPlaces(2).toNumber(),
    thisYear: (byYear.get(current) ?? new Decimal(0)).toDecimalPlaces(2).toNumber(),
    thisYearLabel: current,
    byYear: [...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([label, v]) => ({ label, total: v.toDecimalPlaces(2).toNumber() })),
    byAccount: [...byAccount.values()]
      .map((r) => ({ account: r.account, total: r.total.toDecimalPlaces(2).toNumber(), thisYear: r.thisYear.toDecimalPlaces(2).toNumber() }))
      .sort((a, b) => b.total - a.total),
    fundCharges: fundCharges.sort((a, b) => b.yearly - a.yearly),
    platformCharges: platformCharges.sort((a, b) => b.yearly - a.yearly),
    estimatedYearly: yearly.toDecimalPlaces(2).toNumber(),
    estimatedPct: model.totalValue > 0 && !yearly.isZero() ? yearly.dividedBy(model.totalValue).toNumber() : null,
    missingOcf,
    missingPlatform,
  };
}
