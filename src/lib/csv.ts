import type { PortfolioModel } from './finance/portfolio';
import { ACCOUNT_TYPE_LABELS, ASSET_TYPE_LABELS, TRANSACTION_TYPE_LABELS, type Dataset } from './types';

type Cell = string | number | boolean | null | undefined;

/** RFC 4180 CSV with formula-injection protection for spreadsheet apps. */
export function toCsv(headers: string[], rows: Cell[][]): string {
  const esc = (v: Cell): string => {
    if (v == null) return '';
    let s = String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function transactionsCsv(data: Dataset, ids?: Set<string>): string {
  const acc = new Map(data.accounts.map((a) => [a.id, a]));
  const hold = new Map(data.holdings.map((h) => [h.id, h]));
  const asset = new Map(data.assets.map((a) => [a.id, a]));
  const rows = data.transactions
    .filter((t) => !ids || ids.has(t.id))
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))
    .map((t) => {
      const h = t.holding_id ? hold.get(t.holding_id) : undefined;
      const as = h ? asset.get(h.asset_id) : undefined;
      return [t.occurred_on, acc.get(t.account_id)?.name, TRANSACTION_TYPE_LABELS[t.type], t.amount, acc.get(t.account_id)?.currency, t.description, as?.symbol ?? as?.name, t.units, t.price_per_unit, t.fees, t.transfer_group_id ? 'yes' : ''];
    });
  return toCsv(['Date', 'Account', 'Type', 'Amount', 'Currency', 'Description', 'Investment', 'Units', 'Price per unit', 'Fees', 'Internal transfer'], rows);
}

export function snapshotsCsv(data: Dataset): string {
  const acc = new Map(data.accounts.map((a) => [a.id, a]));
  const rows = [...data.snapshots]
    .sort((a, b) => a.valued_on.localeCompare(b.valued_on))
    .map((s) => [s.valued_on, acc.get(s.account_id)?.name, s.value, acc.get(s.account_id)?.currency, s.notes, s.created_at]);
  return toCsv(['Valuation date', 'Account', 'Value', 'Currency', 'Notes', 'Recorded at'], rows);
}

export function holdingsCsv(model: PortfolioModel): string {
  const rows = model.positions.map((p) => [
    p.asset.name,
    p.asset.symbol,
    p.asset.exchange,
    ASSET_TYPE_LABELS[p.asset.asset_type],
    p.account.name,
    p.units,
    p.avgCost,
    p.asset.currency,
    p.costBasis,
    p.price.price,
    p.price.currency,
    p.price.source,
    p.price.asOf,
    p.marketValue,
    p.unrealisedGain,
    p.unrealisedReturn,
    p.realisedGain,
    p.dividends,
    p.account.currency,
  ]);
  return toCsv(
    ['Name', 'Ticker', 'Exchange', 'Type', 'Account', 'Units', 'Average cost', 'Quote currency', 'Cost basis', 'Latest price', 'Price currency', 'Price source', 'Price as of', 'Market value', 'Unrealised gain', 'Unrealised return', 'Realised gain', 'Dividends', 'Account currency'],
    rows,
  );
}

export function accountsCsv(model: PortfolioModel): string {
  const rows = model.accounts.map((m) => [
    m.account.name,
    m.account.provider,
    ACCOUNT_TYPE_LABELS[m.account.account_type],
    m.account.currency,
    m.account.is_archived ? 'yes' : '',
    m.valueSource,
    m.valueDate,
    m.currentValue,
    m.currentValueBase,
    m.performance.startValue,
    m.performance.contributions,
    m.performance.withdrawals,
    m.performance.netContributions,
    m.performance.gain,
    m.performance.twr.value,
    m.performance.twr.reliability,
    m.performance.xirr.value,
    m.performance.xirr.reliability,
  ]);
  return toCsv(
    ['Account', 'Provider', 'Type', 'Currency', 'Archived', 'Value source', 'Value date', 'Current value', 'Current value (GBP)', 'Opening value', 'Contributions', 'Withdrawals', 'Net contributions', 'Investment gain', 'TWR', 'TWR reliability', 'XIRR', 'XIRR reliability'],
    rows,
  );
}
