import { describe, expect, it } from 'vitest';
import { D } from '../../money';
import type { Flow } from '../flows';
import { computePerformance, timeWeightedReturn, xirr, type ValuePoint } from '../performance';

const pt = (date: string, value: number, estimated = false): ValuePoint => ({ date, value: D(value), estimated });
const fl = (date: string, amount: number): Flow => ({ date, amount: D(amount) });

describe('simple gain', () => {
  it('uses the first snapshot as opening balance when no earlier flows exist', () => {
    // Brief example: 1 Jan £10,000 → 1 Feb £10,500 → 1 Mar £11,200, no flows.
    const r = computePerformance([pt('2025-01-01', 10000), pt('2025-02-01', 10500), pt('2025-03-01', 11200)], []);
    expect(r.startValue).toBe(10000);
    expect(r.currentValue).toBe(11200);
    expect(r.gain).toBe(1200);
    expect(r.twr.value).toBeCloseTo(0.12, 10);
    expect(r.twr.reliability).toBe('ok');
  });

  it('gain = current + withdrawals − contributions − starting value', () => {
    const r = computePerformance(
      [pt('2025-01-01', 10000), pt('2025-06-30', 12500)],
      [fl('2025-02-01', 2000), fl('2025-04-01', -500)],
    );
    expect(r.contributions).toBe(2000);
    expect(r.withdrawals).toBe(500);
    expect(r.netContributions).toBe(1500);
    expect(r.gain).toBe(12500 + 500 - 2000 - 10000); // 1000
  });

  it('starts from £0 when contributions predate the first valuation', () => {
    const r = computePerformance([pt('2025-03-01', 3150)], [fl('2025-01-01', 1000), fl('2025-02-01', 1000), fl('2025-03-01', 1000)]);
    expect(r.startValue).toBe(0);
    expect(r.contributions).toBe(3000);
    expect(r.gain).toBe(150);
  });

  it('ignores flows on or before the opening snapshot', () => {
    const r = computePerformance([pt('2025-01-01', 5000), pt('2025-12-31', 5500)], []);
    expect(r.gain).toBe(500);
  });

  it('treats flows after the last valuation at zero return', () => {
    const r = computePerformance([pt('2025-01-01', 1000), pt('2025-02-01', 1100)], [fl('2025-02-15', 500)]);
    expect(r.currentValue).toBe(1600);
    expect(r.gain).toBe(100);
    expect(r.flowsAfterLastValuation).toBe(500);
  });

  it('does not invent a return with a single valuation', () => {
    const r = computePerformance([pt('2025-01-01', 1000)], []);
    expect(r.twr.reliability).toBe('unavailable');
    expect(r.xirr.reliability).toBe('unavailable');
  });
});

describe('time-weighted return', () => {
  it('equals true TWR when valuations bracket each flow', () => {
    // +10% then deposit then +10% → 21% regardless of the deposit size.
    const r = timeWeightedReturn(
      [pt('2025-01-01', 100), pt('2025-01-31', 110), pt('2025-03-02', 231)],
      [fl('2025-02-01', 100)], // start of the second sub-period → fully weighted
    );
    // second sub-period: (231 − 110 − 100) / (110 + 100 × 30/30) = 0.1
    expect(r.value).toBeCloseTo(0.21, 10);
  });

  it('is not distorted by a large deposit the way a simple ratio is', () => {
    // Portfolio doubles in value only because of a deposit: TWR ≈ 0.
    const r = timeWeightedReturn([pt('2025-01-01', 1000), pt('2025-01-31', 1000), pt('2025-03-02', 2000)], [fl('2025-02-01', 1000)]);
    expect(r.value).toBeCloseTo(0, 10);
  });

  it('annualises only with at least a year of data', () => {
    const short = timeWeightedReturn([pt('2025-01-01', 100), pt('2025-06-01', 105)], []);
    expect(short.annualised).toBeNull();
    const long = timeWeightedReturn([pt('2023-01-01', 100), pt('2025-01-01', 121)], []);
    expect(long.annualised).toBeCloseTo(Math.pow(1.21, 365 / 731) - 1, 10);
  });

  it('flags interpolated inputs as estimates', () => {
    const r = timeWeightedReturn([pt('2025-01-01', 100), pt('2025-02-01', 101, true)], []);
    expect(r.reliability).toBe('estimate');
  });
});

describe('XIRR', () => {
  it('solves a one-year 10% return exactly', () => {
    expect(xirr([{ date: '2021-01-01', amount: -1000 }, { date: '2022-01-01', amount: 1100 }])).toBeCloseTo(0.1, 8);
  });

  it('matches a known multi-flow example', () => {
    // Spreadsheet XIRR of these flows ≈ 0.373362535 (Excel docs example).
    const r = xirr([
      { date: '2008-01-01', amount: -10000 },
      { date: '2008-03-01', amount: 2750 },
      { date: '2008-10-30', amount: 4250 },
      { date: '2009-02-15', amount: 3250 },
      { date: '2009-04-01', amount: 2750 },
    ]);
    expect(r).toBeCloseTo(0.373362535, 6);
  });

  it('handles losses', () => {
    expect(xirr([{ date: '2021-01-01', amount: -1000 }, { date: '2022-01-01', amount: 800 }])).toBeCloseTo(-0.2, 8);
  });

  it('returns null without both inflows and outflows', () => {
    expect(xirr([{ date: '2021-01-01', amount: -1000 }])).toBeNull();
    expect(xirr([{ date: '2021-01-01', amount: 1000 }, { date: '2022-01-01', amount: 1000 }])).toBeNull();
  });

  it('is computed from history in computePerformance', () => {
    const r = computePerformance([pt('2021-01-01', 1000), pt('2022-01-01', 1100)], []);
    expect(r.xirr.value).toBeCloseTo(0.1, 8);
    expect(r.xirr.reliability).toBe('ok');
  });
});
