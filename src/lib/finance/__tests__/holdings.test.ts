import { describe, expect, it } from 'vitest';
import type { MarketPrice } from '../../types';
import { computeHoldingPosition, resolvePrice } from '../holdings';
import { account, asset, holding, tx } from './fixtures';

const rates = { USD: 0.8 };
const quote = (symbol: string, price: number, currency: string, as_of = '2025-06-01T16:30:00Z'): MarketPrice => ({
  symbol,
  price,
  currency,
  change: null,
  change_pct: null,
  as_of,
  fetched_at: as_of,
  source: 'test',
  freshness: 'delayed',
  market_open: false,
});

describe('holding positions', () => {
  it('values an opening position quoted in pence', () => {
    const acc = account();
    const a = asset({ currency: 'GBX' });
    const h = holding(acc.id, a.id, 1000, 50); // 1,000 shares at 50p
    const p = computeHoldingPosition(h, a, acc, [], quote(a.symbol!, 60, 'GBX'), rates);
    expect(p.costBasis).toBe(500);
    expect(p.marketValue).toBe(600);
    expect(p.unrealisedGain).toBe(100);
    expect(p.unrealisedReturn).toBeCloseTo(0.2, 12);
    expect(p.avgCost).toBe(50);
  });

  it('applies buys and sells with average cost and fees', () => {
    const acc = account();
    const a = asset({ currency: 'GBP', symbol: 'FUND' });
    const h = holding(acc.id, a.id, 0, 0);
    const txs = [
      tx(acc.id, 'buy', '2025-01-01', 1000, { holding_id: h.id, units: 100, price_per_unit: 10, fees: 10 }),
      tx(acc.id, 'buy', '2025-02-01', 1200, { holding_id: h.id, units: 100, price_per_unit: 12, fees: 10 }),
      // avg cost = (1010 + 1210) / 200 = 11.10
      tx(acc.id, 'sell', '2025-03-01', 650, { holding_id: h.id, units: 50, price_per_unit: 13, fees: 5 }),
      tx(acc.id, 'dividend', '2025-04-01', 25, { holding_id: h.id }),
    ];
    const p = computeHoldingPosition(h, a, acc, txs, quote('FUND', 14, 'GBP'), rates);
    expect(p.units).toBe(150);
    expect(p.costBasis).toBe(1665); // 150 × 11.10
    expect(p.realisedGain).toBe(650 - 5 - 555); // 90
    expect(p.marketValue).toBe(2100);
    expect(p.unrealisedGain).toBe(435);
    expect(p.dividends).toBe(25);
    expect(p.fees).toBe(25);
  });

  it('converts USD holdings into the account currency', () => {
    const acc = account();
    const a = asset({ currency: 'USD', symbol: 'AAPL' });
    const h = holding(acc.id, a.id, 10, 100);
    const p = computeHoldingPosition(h, a, acc, [], quote('AAPL', 150, 'USD'), rates);
    expect(p.costBasis).toBe(800);
    expect(p.marketValue).toBe(1200);
  });

  it('falls back to cost when no price is available', () => {
    const acc = account();
    const a = asset({ currency: 'GBP' });
    const h = holding(acc.id, a.id, 10, 5);
    const p = computeHoldingPosition(h, a, acc, [], undefined, rates);
    expect(p.marketValue).toBeNull();
    expect(p.valueForTotals).toBe(50);
    expect(p.warnings.length).toBeGreaterThan(0);
  });

  it('uses manual prices for manual assets and newer manual overrides', () => {
    const manual = asset({ price_mode: 'manual', manual_price: 1.5, manual_price_at: '2025-06-02T00:00:00Z', currency: 'GBP' });
    expect(resolvePrice(manual, undefined).source).toBe('manual');
    const market = asset({ manual_price: 1.5, manual_price_at: '2025-06-02T00:00:00Z', currency: 'GBP' });
    expect(resolvePrice(market, quote('X', 2, 'GBP', '2025-06-01T00:00:00Z')).price).toBe(1.5);
    expect(resolvePrice(market, quote('X', 2, 'GBP', '2025-06-03T00:00:00Z')).price).toBe(2);
  });
});
