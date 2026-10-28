import { describe, expect, it } from 'vitest';
import { isaAllowance, taxYearOf } from '../isa';
import { feesSummary } from '../fees';
import { monthlyFactor, project } from '../projection';
import { dailySummary } from '../daily-summary';
import { buildPortfolio } from '../portfolio';
import { account, asset, dataset, holding, tx } from './fixtures';
import type { MarketPrice } from '../../types';

describe('tax year', () => {
  it('runs 6 April to 5 April', () => {
    expect(taxYearOf('2026-04-05')).toEqual({ start: '2025-04-06', end: '2026-04-05', label: '2025/26' });
    expect(taxYearOf('2026-04-06')).toEqual({ start: '2026-04-06', end: '2027-04-05', label: '2026/27' });
    expect(taxYearOf('2026-10-27').label).toBe('2026/27');
  });
});

describe('ISA allowance', () => {
  const isa = account({ account_type: 'stocks_shares_isa' });
  const lisa = account({ account_type: 'lifetime_isa', name: 'LISA' });
  const cash = account({ account_type: 'cash_savings', name: 'Saver' });
  const gia = account({ account_type: 'gia', name: 'GIA' });

  it('counts deposits and transfers from non-ISA accounts in the current tax year only', () => {
    const data = dataset({
      accounts: [isa, lisa, cash, gia],
      transactions: [
        tx(isa.id, 'deposit', '2026-04-05', 1000), // previous year
        tx(isa.id, 'deposit', '2026-04-06', 2000),
        tx(lisa.id, 'deposit', '2026-05-01', 4500),
        tx(cash.id, 'transfer_out', '2026-06-01', 3000, { transfer_group_id: 'g1' }),
        tx(isa.id, 'transfer_in', '2026-06-01', 3000, { transfer_group_id: 'g1' }),
        tx(lisa.id, 'transfer_out', '2026-07-01', 500, { transfer_group_id: 'g2' }),
        tx(isa.id, 'transfer_in', '2026-07-01', 500, { transfer_group_id: 'g2' }), // ISA to ISA
        tx(isa.id, 'transfer_in', '2026-08-01', 9000), // from another provider
        tx(isa.id, 'withdrawal', '2026-09-01', 800),
        tx(gia.id, 'deposit', '2026-09-01', 5000),
      ],
    });
    const r = isaAllowance(data, '2026-10-27');
    expect(r.current.used).toBe(9500);
    expect(r.current.remaining).toBe(10500);
    expect(r.current.lisaUsed).toBe(4500);
    expect(r.current.lisaOver).toBe(500);
    expect(r.current.byAccount.map((a) => a.amount)).toEqual([5000, 4500]);
    expect(r.history.map((y) => [y.year.label, y.used])).toEqual([['2025/26', 1000]]);
    expect(r.daysLeft).toBe(161);
    expect(r.monthsLeft).toBe(6); // today, then 6 Nov, Dec, Jan, Feb, Mar
    expect(r.monthlyToMax).toBe(1750);
  });
});

describe('fees', () => {
  it('totals recorded fees and estimates charges from rates', () => {
    const a = account({ valuation_mode: 'holdings', platform_fee_pct: 0.45 });
    const fund = asset({ symbol: 'GB00BG0QP604', asset_type: 'fund', currency: 'GBX', ongoing_charge_pct: 0.13 });
    const h = holding(a.id, fund.id, 1000, 300);
    const data = dataset({
      accounts: [a],
      assets: [fund],
      holdings: [h],
      transactions: [tx(a.id, 'fee', '2026-05-01', 12.5), tx(a.id, 'fee', '2025-05-01', 10), tx(a.id, 'buy', '2026-06-01', 0, { fees: 1.5, holding_id: null })],
    });
    const prices: Record<string, MarketPrice> = {
      GB00BG0QP604: { symbol: 'GB00BG0QP604', price: 400, currency: 'GBX', change: 2, change_pct: 0.005, as_of: '2026-10-26T12:00:00.000Z', fetched_at: '', source: 'eodhd', freshness: 'end_of_day', market_open: null },
    };
    const model = buildPortfolio({ data, prices, rates: {}, today: '2026-10-27' });
    const f = feesSummary(model, data, {}, '2026-10-27');
    expect(f.total).toBe(24);
    expect(f.thisYear).toBe(14);
    expect(f.byYear).toEqual([
      { label: '2026/27', total: 14 },
      { label: '2025/26', total: 10 },
    ]);
    expect(f.fundCharges[0].yearly).toBe(5.2); // 0.13% of £4,000
    expect(f.platformCharges[0].yearly).toBe(18); // 0.45% of £4,000
    expect(f.estimatedYearly).toBe(23.2);

    // Daily summary from the same model: 1000 units × 2p = £20.
    const d = dailySummary(model, data, prices, {});
    expect(d.holdingsChange).toBe(20);
    expect(d.holdingsChangePct).toBeCloseTo(20 / 3980, 10);
    expect(d.pricesAsOf).toBe('2026-10-26');
    expect(d.transactions).toHaveLength(0);
  });
});

describe('projection', () => {
  it('compounds monthly with end-of-month contributions', () => {
    const r = project([{ id: 'a', label: 'A', sub: '', value: 1000, monthly: 100, feePct: 0 }], { growth: 0, years: 1 });
    expect(r.final).toBe(2200);
    expect(r.finalWithout).toBe(1000);
    expect(r.paidIn).toBe(2200);
    expect(r.points.map((p) => p.year)).toEqual([0, 1]);
  });

  it('applies growth less charges', () => {
    expect(monthlyFactor(0.05, 0) ** 12).toBeCloseTo(1.05, 10);
    const r = project([{ id: 'a', label: 'A', sub: '', value: 10000, monthly: 0, feePct: 1 }], { growth: 0.05, years: 2 });
    expect(r.final).toBeCloseTo(10000 * (1.05 * 0.99) ** 2, 1);
  });
});
