import { describe, expect, it } from 'vitest';
import { buildPortfolio, seriesForPeriod } from '../portfolio';
import { account, asset, dataset, holding, snap, tx } from './fixtures';

const today = '2025-06-30';

describe('portfolio model', () => {
  it('never adds holdings on top of a snapshot-valued account', () => {
    const acc = account({ valuation_mode: 'snapshot' });
    const a = asset({ currency: 'GBP', symbol: 'X' });
    const data = dataset({
      accounts: [acc],
      snapshots: [snap(acc.id, '2025-06-29', 10000)],
      assets: [a],
      holdings: [holding(acc.id, a.id, 100, 90)],
    });
    const prices = { X: { symbol: 'X', price: 95, currency: 'GBP', change: null, change_pct: null, as_of: '2025-06-30T00:00:00Z', fetched_at: '', source: 't', freshness: 'delayed' as const, market_open: false } };
    const m = buildPortfolio({ data, prices, rates: {}, today });
    expect(m.totalValue).toBe(10000);
    // ...but the gap between snapshot and holdings is flagged.
    expect(m.accounts[0].discrepancy?.calculatedValue).toBe(9500);
    expect(m.accounts[0].discrepancy?.significant).toBe(false); // −5% is the threshold
  });

  it('calculates holdings-mode accounts from holdings plus cash', () => {
    const acc = account({ valuation_mode: 'holdings', cash_balance: 250 });
    const a = asset({ currency: 'GBP', symbol: 'Y', price_mode: 'manual', manual_price: 20, manual_price_at: '2025-06-30T00:00:00Z' });
    const data = dataset({ accounts: [acc], assets: [a], holdings: [holding(acc.id, a.id, 50, 18)] });
    const m = buildPortfolio({ data, prices: {}, rates: {}, today });
    expect(m.totalValue).toBe(1250);
    expect(m.accounts[0].valueSource).toBe('calculated');
  });

  it('nets internal transfers out of portfolio contributions', () => {
    const isa = account({ name: 'ISA' });
    const gia = account({ name: 'GIA', account_type: 'gia' });
    const data = dataset({
      accounts: [isa, gia],
      snapshots: [snap(gia.id, '2025-01-31', 5000), snap(isa.id, '2025-01-31', 0), snap(gia.id, '2025-06-30', 3100), snap(isa.id, '2025-06-30', 2050)],
      transactions: [
        tx(gia.id, 'deposit', '2025-01-01', 5000),
        tx(gia.id, 'transfer_out', '2025-04-06', 2000, { transfer_group_id: 'g' }),
        tx(isa.id, 'transfer_in', '2025-04-06', 2000, { transfer_group_id: 'g' }),
      ],
    });
    const m = buildPortfolio({ data, prices: {}, rates: {}, today });
    expect(m.contributions).toBe(5000);
    expect(m.withdrawals).toBe(0);
    expect(m.totalValue).toBe(5150);
    expect(m.gain).toBe(150);
    // Account level sees the transfer as a flow.
    const isaModel = m.accounts.find((x) => x.account.id === isa.id)!;
    expect(isaModel.performance.contributions).toBe(2000);
    expect(isaModel.performance.gain).toBe(50);
  });

  it('treats a first snapshot without earlier flows as an opening balance', () => {
    const acc = account();
    const data = dataset({ accounts: [acc], snapshots: [snap(acc.id, '2025-01-01', 10000), snap(acc.id, '2025-03-01', 11200)] });
    const m = buildPortfolio({ data, prices: {}, rates: {}, today });
    expect(m.openingBalances).toBe(10000);
    expect(m.contributions).toBe(0);
    expect(m.gain).toBe(1200);
    expect(m.performance.gain).toBe(1200);
    expect(m.performance.twr.value).toBeCloseTo(0.12, 10);
  });

  it('marks interpolated history as estimated and keeps actual points', () => {
    const a = account({ name: 'A' });
    const b = account({ name: 'B' });
    const data = dataset({
      accounts: [a, b],
      snapshots: [snap(a.id, '2025-01-01', 1000), snap(a.id, '2025-03-01', 1200), snap(b.id, '2025-01-01', 500), snap(b.id, '2025-02-01', 550), snap(b.id, '2025-03-01', 600)],
    });
    const m = buildPortfolio({ data, prices: {}, rates: {}, today: '2025-03-01' });
    const feb = m.series.find((p) => p.date === '2025-02-01')!;
    expect(feb.estimated).toBe(true);
    expect(feb.estimatedAccounts).toEqual(['A']);
    // A interpolated linearly: 1000 + 200 × 31/59
    expect(feb.value).toBeCloseTo(1000 + (200 * 31) / 59 + 550, 2);
    expect(m.series.find((p) => p.date === '2025-03-01')!.estimated).toBe(false);
  });

  it('interpolation respects deposits between snapshots', () => {
    const a = account();
    const data = dataset({
      accounts: [a],
      snapshots: [snap(a.id, '2025-01-01', 1000), snap(a.id, '2025-01-31', 2000)],
      transactions: [tx(a.id, 'deposit', '2025-01-16', 1000)],
    });
    const m = buildPortfolio({ data, prices: {}, rates: {}, today: '2025-01-31' });
    const acc = m.accounts[0];
    expect(acc.valueAt('2025-01-15')!.value.toNumber()).toBe(1000);
    expect(acc.valueAt('2025-01-16')!.value.toNumber()).toBe(2000);
  });

  it('converts foreign-currency accounts to GBP', () => {
    const usd = account({ currency: 'USD' });
    const data = dataset({ accounts: [usd], snapshots: [snap(usd.id, '2025-06-01', 1000)] });
    const m = buildPortfolio({ data, prices: {}, rates: { USD: 0.8 }, today });
    expect(m.totalValue).toBe(800);
  });

  it('adds an interpolated start point for a period window', () => {
    const a = account();
    const data = dataset({ accounts: [a], snapshots: [snap(a.id, '2025-01-01', 1000), snap(a.id, '2025-12-31', 2000)] });
    const m = buildPortfolio({ data, prices: {}, rates: {}, today: '2025-12-31' });
    const s = seriesForPeriod(m, '2025-07-02');
    expect(s[0].date).toBe('2025-07-02');
    expect(s[0].estimated).toBe(true);
    expect(s[0].value).toBeCloseTo(1000 + (1000 * 182) / 364, 1);
  });

  describe('same-day valuations and contributions', () => {
    it('a first deposit valued the same day starts from £0', () => {
      const a = account();
      const data = dataset({ accounts: [a], snapshots: [snap(a.id, '2025-03-01', 1000)], transactions: [tx(a.id, 'deposit', '2025-03-01', 1000)] });
      const m = buildPortfolio({ data, prices: {}, rates: {}, today: '2025-03-01' });
      expect(m.accounts[0].performance.startValue).toBe(0);
      expect(m.accounts[0].performance.gain).toBe(0);
      expect(m.openingBalances).toBe(0);
      expect(m.gain).toBe(0);
    });

    it('a valuation that includes a same-day deposit keeps the earlier balance as opening value', () => {
      const a = account();
      const data = dataset({ accounts: [a], snapshots: [snap(a.id, '2025-03-01', 1200)], transactions: [tx(a.id, 'deposit', '2025-03-01', 200)] });
      const m = buildPortfolio({ data, prices: {}, rates: {}, today: '2025-03-01' });
      expect(m.accounts[0].performance.startValue).toBe(1000);
      expect(m.accounts[0].performance.contributions).toBe(200);
      expect(m.gain).toBe(0);
    });

    it('a deposit recorded after the same-day valuation is not inside it', () => {
      const a = account();
      const data = dataset({
        accounts: [a],
        snapshots: [snap(a.id, '2025-03-01', 1000, '2025-03-01T09:00:00Z')],
        transactions: [tx(a.id, 'deposit', '2025-03-01', 200, { created_at: '2025-03-01T09:05:00Z' })],
      });
      const m = buildPortfolio({ data, prices: {}, rates: {}, today: '2025-03-01' });
      const p = m.accounts[0].performance;
      expect(p.startValue).toBe(1000);
      expect(p.contributions).toBe(200);
      expect(p.currentValue).toBe(1200);
      expect(p.gain).toBe(0);
      expect(m.totalValue).toBe(1200);
      expect(m.gain).toBe(0);
    });
  });
});
