import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { runDailyUpdate } from '../daily';

type Row = Record<string, unknown>;

/** Minimal in-memory stand-in for the Supabase query builder used by the job. */
function fakeDb(tables: Record<string, Row[]>) {
  const from = (name: string) => {
    const rows = (tables[name] ??= []);
    let result = [...rows];
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => ((result = result.filter((r) => r[k] === v)), q),
      in: (k: string, vs: unknown[]) => ((result = result.filter((r) => vs.includes(r[k]))), q),
      order: (k: string, o?: { ascending?: boolean }) => (
        (result = result.sort((a, b) => String(a[k]).localeCompare(String(b[k])) * (o?.ascending === false ? -1 : 1))), q
      ),
      limit: (n: number) => ((result = result.slice(0, n)), q),
      upsert: async (input: Row | Row[], { onConflict }: { onConflict: string }) => {
        const keys = onConflict.split(',');
        for (const r of Array.isArray(input) ? input : [input]) {
          const i = rows.findIndex((x) => keys.every((k) => x[k] === r[k]));
          if (i >= 0) rows[i] = { ...rows[i], ...r };
          else rows.push(r);
        }
        return { error: null };
      },
      insert: async (r: Row) => (rows.push({ id: `new-${rows.length}`, created_at: new Date().toISOString(), ...r }), { error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => void) => resolve({ data: result, error: null }),
    };
    return q;
  };
  return { from } as never;
}

const U = 'user-1';

function seed() {
  return {
    accounts: [
      { id: 'hl', user_id: U, name: 'HL', account_type: 'stocks_shares_isa', currency: 'GBP', valuation_mode: 'holdings', cash_balance: '0', is_archived: false, created_at: '2026-10-01T00:00:00Z' },
      { id: 't212', user_id: U, name: 'T212', account_type: 'stocks_shares_isa', currency: 'GBP', valuation_mode: 'snapshot', cash_balance: '0', is_archived: false, created_at: '2026-10-01T00:00:00Z' },
    ],
    account_snapshots: [] as Row[],
    transactions: [] as Row[],
    assets: [{ id: 'lg', user_id: U, name: 'L&G', symbol: 'GB00BG0QP604', currency: 'GBX', price_mode: 'market', asset_type: 'fund', created_at: '2026-10-01T00:00:00Z' }],
    holdings: [{ id: 'h1', user_id: U, account_id: 'hl', asset_id: 'lg', opening_units: '1000', opening_avg_cost: '300', created_at: '2026-10-01T00:00:00Z' }],
    price_history: [] as Row[],
    market_prices: [] as Row[],
  };
}

describe('daily update job', () => {
  const calls: string[] = [];
  beforeEach(() => {
    calls.length = 0;
    process.env.EODHD_API_KEY = 'test';
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      if (url.includes('eodhd.com')) {
        return new Response(JSON.stringify([
          { date: '2026-10-27', close: 376.5 },
          { date: '2026-10-26', close: 375.9 },
        ]));
      }
      return new Response(JSON.stringify({ base: 'GBP', date: '2026-10-27', rates: { USD: 1.25 } }));
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EODHD_API_KEY;
  });

  it('backfills fund prices and saves one valuation per holdings account', async () => {
    const t = seed();
    const res = await runDailyUpdate(fakeDb(t), '2026-10-27');

    expect(calls.find((c) => c.includes('eodhd.com'))).toContain('GB00BG0QP604.EUFUND');
    expect(calls.find((c) => c.includes('eodhd.com'))).toContain('from=2025-10-27');
    expect(t.price_history).toHaveLength(2);
    expect(t.market_prices[0]).toMatchObject({ symbol: 'GB00BG0QP604', price: 376.5, currency: 'GBX' });

    // 1000 units × 376.5p = £3,765.00, only for the holdings-valued account.
    expect(res.snapshots).toEqual([{ account_id: 'hl', value: 3765 }]);
    expect(t.account_snapshots).toHaveLength(1);
    expect(t.account_snapshots[0]).toMatchObject({ user_id: U, account_id: 'hl', valued_on: '2026-10-27', value: 3765 });
  });

  it('is safe to run twice on the same day', async () => {
    const t = seed();
    await runDailyUpdate(fakeDb(t), '2026-10-27');
    const eodhdCalls = calls.filter((c) => c.includes('eodhd.com')).length;
    await runDailyUpdate(fakeDb(t), '2026-10-27');
    expect(calls.filter((c) => c.includes('eodhd.com')).length).toBe(eodhdCalls); // already up to date
    expect(t.account_snapshots).toHaveLength(1);
  });
});
