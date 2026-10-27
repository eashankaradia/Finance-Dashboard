import { D, Decimal } from '../money';
import { ASSET_TYPE_LABELS, type AccountType } from '../types';
import type { PortfolioModel } from './portfolio';

export interface AllocationSlice {
  key: string;
  label: string;
  value: number;
}

const CASH_ACCOUNTS: AccountType[] = ['cash_savings', 'cash_isa', 'premium_bonds'];

/**
 * Allocation by asset class. Each account's value (exactly as counted in the
 * total) is split by its tracked holdings; a snapshot-valued account's
 * holdings are scaled to the snapshot so nothing is double counted. Accounts
 * without holdings fall back to a class implied by the account type.
 */
export function allocationByAssetClass(model: PortfolioModel): AllocationSlice[] {
  const totals = new Map<string, Decimal>();
  const add = (key: string, v: Decimal) => totals.set(key, (totals.get(key) ?? new Decimal(0)).plus(v));

  for (const m of model.activeAccounts) {
    const accountValue = D(m.currentValueBase);
    if (accountValue.lessThanOrEqualTo(0)) continue;
    const held = m.positions.filter((p) => p.valueForTotals > 0);
    const heldTotal = held.reduce((s, p) => s.plus(p.valueForTotals), new Decimal(0));
    const cash = m.account.valuation_mode === 'holdings' ? D(m.account.cash_balance) : new Decimal(0);
    const base = heldTotal.plus(cash);
    if (base.greaterThan(0)) {
      const scale = accountValue.dividedBy(base);
      for (const p of held) add(p.asset.asset_type, D(p.valueForTotals).times(scale));
      if (cash.greaterThan(0)) add('cash', cash.times(scale));
    } else if (CASH_ACCOUNTS.includes(m.account.account_type)) {
      add('cash', accountValue);
    } else if (m.account.account_type === 'sipp' || m.account.account_type === 'workplace_pension') {
      add('pension', accountValue);
    } else {
      add('unspecified', accountValue);
    }
  }

  const label = (k: string) =>
    k === 'pension' ? 'Pension (mixed)' : k === 'unspecified' ? 'Not broken down' : (ASSET_TYPE_LABELS as Record<string, string>)[k] ?? k;
  return [...totals.entries()].map(([key, v]) => ({ key, label: label(key), value: v.toDecimalPlaces(2).toNumber() }));
}

export function allocationByAccount(model: PortfolioModel): AllocationSlice[] {
  return model.activeAccounts.map((m) => ({ key: m.account.id, label: m.account.name, value: m.currentValueBase }));
}

export function allocationByHolding(model: PortfolioModel, convertToBase: (v: number, ccy: string) => number): AllocationSlice[] {
  const byAsset = new Map<string, AllocationSlice>();
  for (const p of model.positions) {
    if (p.account.is_archived || p.valueForTotals <= 0) continue;
    const v = convertToBase(p.valueForTotals, p.account.currency);
    const prev = byAsset.get(p.asset.id);
    byAsset.set(p.asset.id, { key: p.asset.id, label: p.asset.symbol ?? p.asset.name, value: (prev?.value ?? 0) + v });
  }
  return [...byAsset.values()];
}
