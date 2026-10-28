import { describe, expect, it } from 'vitest';
import { parseFrankfurter } from '../fx';
import { isMarketOpen, marketForSymbol } from '../hours';
import { configuredProviders, eodhdFundCode, eodhdStockCode, NotFoundError, parseEodhdRealtime, parseAlphaVantageQuote, parseEodhdEod, parseFinnhubQuote, providerFor, RateLimitError } from '../providers';

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

  it('parses an EODHD fund price with the day-on-day change', () => {
    const rows = [
      { date: '2026-10-26', open: 375.9, high: 375.9, low: 375.9, close: 375.9, adjusted_close: 375.9, volume: 0 },
      { date: '2026-10-23', open: 372.1, high: 372.1, low: 372.1, close: 372.1, adjusted_close: 372.1, volume: 0 },
    ];
    const q = parseEodhdEod(rows, { symbol: 'GB00BG0QP604', currency: 'GBX' }, new Date('2026-10-27T09:00:00Z'));
    expect(q.price).toBe(375.9);
    expect(q.change).toBeCloseTo(3.8, 10);
    expect(q.change_pct).toBeCloseTo(3.8 / 372.1, 10);
    expect(q.as_of).toBe('2026-10-26T12:00:00.000Z');
    expect(q.freshness).toBe('end_of_day');
    expect(() => parseEodhdEod([], { symbol: 'GB00BG0QP604', currency: 'GBX' })).toThrow(NotFoundError);
    expect(() => parseEodhdEod({ message: 'You exceeded your daily API requests limit' }, { symbol: 'X', currency: 'GBX' })).toThrow(RateLimitError);
  });

  it('routes ISINs to EODHD and tickers elsewhere', () => {
    expect(eodhdFundCode('gb00bg0qp604')).toBe('GB00BG0QP604.EUFUND');
    expect(eodhdFundCode('GB00BN7CMW56.EUFUND')).toBe('GB00BN7CMW56.EUFUND');
    expect(eodhdFundCode('VUSA.LON')).toBeNull();
    const providers = configuredProviders({ EODHD_API_KEY: 'k', ALPHA_VANTAGE_API_KEY: 'k' });
    expect(providerFor('GB00BG0QP604', providers)?.name).toBe('EODHD');
    expect(providerFor('VUSA.LON', providers)?.name).toBe('Alpha Vantage');
    expect(marketForSymbol('GB00BG0QP604')).toBe('OTHER');
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

  it('prices shares with EODHD when it is the only provider', async () => {
    const providers = configuredProviders({ EODHD_API_KEY: 'k' });
    const p = providerFor('NVDA', providers)!;
    expect(p.name).toBe('EODHD');
    expect(eodhdStockCode('NVDA')).toBe('NVDA.US');
    expect(eodhdStockCode('BRK.B')).toBe('BRK-B.US');
    expect(eodhdStockCode('VUSA.LON')).toBe('VUSA.LSE');
    expect(eodhdStockCode('GB00BG0QP604')).toBeNull();

    const urls: string[] = [];
    const q = await p.quote({ symbol: 'NVDA', currency: 'USD' }, (async (u: string) => {
      urls.push(u);
      return new Response(JSON.stringify({ code: 'NVDA.US', timestamp: 1793217600, close: 186.26, previousClose: 183.1, change: 3.16, change_p: 1.7258 }));
    }) as typeof fetch);
    expect(urls[0]).toContain('/real-time/NVDA.US?');
    expect(q).toMatchObject({ symbol: 'NVDA', price: 186.26, currency: 'USD', change: 3.16, source: 'EODHD' });
    expect(q.change_pct).toBeCloseTo(0.017258, 6);

    // Other providers still come first for shares; funds still go to EODHD.
    const both = configuredProviders({ EODHD_API_KEY: 'k', FINNHUB_API_KEY: 'k' });
    expect(providerFor('NVDA', both)?.name).toBe('Finnhub');
    expect(providerFor('GB00BG0QP604', both)?.name).toBe('EODHD');
  });

  it('rejects empty EODHD real-time quotes', () => {
    expect(() => parseEodhdRealtime({ code: 'XYZ.US', timestamp: 'NA', close: 'NA' }, { symbol: 'XYZ', currency: 'USD' })).toThrow(NotFoundError);
  });
});
