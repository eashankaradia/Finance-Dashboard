import { describe, expect, it } from 'vitest';
import { groupFlows, toFlows, totalFlows } from '../flows';
import { tx } from './fixtures';

describe('cash flow classification', () => {
  const txs = [
    tx('a', 'deposit', '2024-01-10', 1000),
    tx('a', 'withdrawal', '2024-02-10', 200),
    tx('a', 'transfer_out', '2024-03-01', 300, { transfer_group_id: 'g1' }),
    tx('b', 'transfer_in', '2024-03-01', 300, { transfer_group_id: 'g1' }),
    tx('a', 'buy', '2024-01-11', 900),
    tx('a', 'sell', '2024-02-09', 250),
    tx('a', 'dividend', '2024-02-15', 12),
    tx('a', 'interest', '2024-02-15', 3),
    tx('a', 'fee', '2024-02-15', 5),
  ];

  it('portfolio scope counts only deposits and withdrawals', () => {
    const t = totalFlows(toFlows(txs, 'portfolio'));
    expect(t.contributions.toNumber()).toBe(1000);
    expect(t.withdrawals.toNumber()).toBe(200);
    expect(t.net.toNumber()).toBe(800);
  });

  it('account scope counts transfers in and out for each account', () => {
    const a = totalFlows(toFlows(txs.filter((t) => t.account_id === 'a'), 'account'));
    const b = totalFlows(toFlows(txs.filter((t) => t.account_id === 'b'), 'account'));
    expect(a.contributions.toNumber()).toBe(1000);
    expect(a.withdrawals.toNumber()).toBe(500);
    expect(b.contributions.toNumber()).toBe(300);
    // Transfers net to zero across accounts: no double counting.
    expect(a.net.plus(b.net).toNumber()).toBe(800);
  });

  it('buys, sells, dividends, interest and fees are not contributions', () => {
    const trades = txs.filter((t) => ['buy', 'sell', 'dividend', 'interest', 'fee'].includes(t.type));
    expect(toFlows(trades, 'account')).toHaveLength(0);
    expect(toFlows(trades, 'portfolio')).toHaveLength(0);
  });

  it('groups by month and year', () => {
    const flows = toFlows(txs, 'portfolio');
    expect(groupFlows(flows, 'month')).toEqual([
      { key: '2024-01', contributions: 1000, withdrawals: 0, net: 1000 },
      { key: '2024-02', contributions: 0, withdrawals: 200, net: -200 },
    ]);
    expect(groupFlows(flows, 'year')).toEqual([{ key: '2024', contributions: 1000, withdrawals: 200, net: 800 }]);
  });
});
