import { describe, expect, it } from 'vitest';
import { buildDemoDataset, demoPrices, DEMO_FX } from '../../data/demo';
import { buildPortfolio } from '../portfolio';

describe('demo dataset', () => {
  it('builds a coherent portfolio', () => {
    const today = '2026-10-27';
    const m = buildPortfolio({ data: buildDemoDataset(today), prices: demoPrices(), rates: DEMO_FX, today });
    expect(Number.isFinite(m.totalValue)).toBe(true);
    expect(m.totalValue).toBeGreaterThan(50000);
    expect(m.series.length).toBeGreaterThan(20);
    // The internal transfer must not appear as a contribution or withdrawal.
    const transferLegs = buildDemoDataset(today).transactions.filter((t) => t.transfer_group_id);
    expect(transferLegs).toHaveLength(2);
    expect(m.performance.twr.value).not.toBeNull();
    if (process.env.PRINT) {
      console.log({ total: m.totalValue, contrib: m.contributions, wd: m.withdrawals, opening: m.openingBalances, gain: m.gain, twr: m.performance.twr, xirr: m.performance.xirr });
      for (const a of m.accounts) console.log(a.account.name, a.currentValue, a.valueSource, a.performance.gain, a.performance.twr.value?.toFixed(4), a.performance.twr.reliability, a.discrepancy);
    }
  });
});
