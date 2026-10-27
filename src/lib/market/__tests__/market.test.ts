import { describe, expect, it } from 'vitest';
import { parseFrankfurter } from '../fx';
import { isMarketOpen, marketForSymbol } from '../hours';
import { NotFoundError, parseAlphaVantageQuote, parseFinnhubQuote, RateLimitError } from '../providers';

// Fixtures follow the providers' documented response formats.
const av = {
  'Global Quote': {
    '01. symbol': 'TSCO.LON',
    '05. price': '381.6000',
    '07. latest trading day': '2026-10-23',
    '09. change': '0.7000',
    '10. change percent': '0.1838%',
  },
};

describe('market data parsing', () => {
  it('parses an Alpha Vantage quote as end-of-day when the trading day has passed', () => {
    const q = parseAlphaVantageQuote(av, { symbol: 'TSCO.LON', currency: 'GBX' }, new Date('2026-10-26T10:00:00Z'));
    expect(q.price).toBe(381.6);
    expect(q.currency).toBe('GBX');
    expect(q.change_pct).toBeCloseTo(0.001838, 6);
    expect(q.freshness).toBe('end_of_day');
    expect(q.market_open).toBe(true); // Monday 10:00 UK
  });

  it('detects Alpha Vantage rate limits and unknown symbols', () => {
    expect(() => parseAlphaVantageQuote({ Information: 'We have detected your API key... 25 requests per day.' }, { symbol: 'X', currency: 'USD' })).toThrow(RateLimitError);
    expect(() => parseAlphaVantageQuote({ 'Global Quote': {} }, { symbol: 'X', currency: 'USD' })).toThrow(NotFoundError);
  });

  it('parses a Finnhub quote and rejects unknown symbols', () => {
    const q = parseFinnhubQuote({ c: 232.5, d: 2.6, dp: 1.13, t: 1761336000 }, { symbol: 'AAPL', currency: 'USD' });
    expect(q.price).toBe(232.5);
    expect(q.freshness).toBe('delayed');
    expect(() => parseFinnhubQuote({ c: 0, d: null, dp: null, t: 0 }, { symbol: 'NOPE', currency: 'USD' })).toThrow(NotFoundError);
  });

  it('converts Frankfurter rates to GBP per unit', () => {
    const { rates } = parseFrankfurter({ base: 'GBP', date: '2026-10-27', rates: { USD: 1.25, EUR: 1.2 } });
    expect(rates.USD).toBeCloseTo(0.8, 10);
  });

  it('knows exchanges and trading hours', () => {
    expect(marketForSymbol('VUSA.LON')).toBe('LSE');
    expect(marketForSymbol('AAPL')).toBe('US');
    expect(isMarketOpen('LSE', new Date('2026-10-24T10:00:00Z'))).toBe(false); // Saturday
    expect(isMarketOpen('US', new Date('2026-10-27T14:00:00Z'))).toBe(true); // 10:00 New York
    expect(isMarketOpen('US', new Date('2026-10-27T21:30:00Z'))).toBe(false);
  });
});
