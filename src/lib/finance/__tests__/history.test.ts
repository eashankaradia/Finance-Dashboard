import { describe, expect, it } from 'vitest';
import { holdingHistory, priceReturn, unitsOn } from '../history';
import type { Account, Asset, Holding, Transaction } from '../../types';

const account = { id: 'a1', currency: 'GBP' } as Account;
const asset = { id: 's1', currency: 'GBX', symbol: 'GB00BG0QP604' } as Asset;
const holding = { id: 'h1', account_id: 'a1', asset_id: 's1', opening_units: 100, opening_avg_cost: 300 } as Holding;
const tx = (over: Partial<Transaction>) => ({ holding_id: 'h1', account_id: 'a1', created_at: '2026-01-01T00:00:00Z', ...over }) as Transaction;

describe('holding history', () => {
  it('counts units held on each day from linked trades', () => {
    const txs = [tx({ type: 'buy', units: 50, amount: 180, occurred_on: '2026-03-02' }), tx({ type: 'sell', units: 30, amount: 110, occurred_on: '2026-04-01' })];
    expect(unitsOn(holding, txs, '2026-03-01').toNumber()).toBe(100);
    expect(unitsOn(holding, txs, '2026-03-02').toNumber()).toBe(150);
    expect(unitsOn(holding, txs, '2026-05-01').toNumber()).toBe(120);
  });

  it('values each day in account currency (pence → pounds)', () => {
    const txs = [tx({ type: 'buy', units: 50, amount: 180, occurred_on: '2026-03-02' })];
    const h = holdingHistory(holding, asset, account, txs, [
      { date: '2026-03-02', close: 360 },
      { date: '2026-03-01', close: 350 },
    ], {});
    expect(h.map((p) => p.date)).toEqual(['2026-03-01', '2026-03-02']);
    expect(h[0].value).toBe(350); // 100 × 350p
    expect(h[1].value).toBe(540); // 150 × 360p
  });

  it('measures price return from the last close on or before the period start', () => {
    const prices = [
      { date: '2026-08-29', close: 100 }, // Friday before the 1M start (Sunday 30th)
      { date: '2026-09-01', close: 105 },
      { date: '2026-09-30', close: 110 },
    ];
    expect(priceReturn(prices, 1)).toBeCloseTo(0.1, 10);
    expect(priceReturn(prices, 3)).toBeNull(); // history too short
    expect(priceReturn([prices[2]], 1)).toBeNull();
  });
});
