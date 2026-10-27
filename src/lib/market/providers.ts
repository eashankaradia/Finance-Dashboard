import type { MarketPrice } from '../types';
import { isMarketOpen, marketForSymbol, todayInMarket } from './hours';

/**
 * Market data providers (server-side only: they read API keys from env).
 *
 * Chosen setup (all free tiers):
 * - Alpha Vantage (ALPHA_VANTAGE_API_KEY): UK and US coverage via GLOBAL_QUOTE.
 *   Free tier: 25 requests/day, 5/minute. Quotes are delayed / end-of-day.
 *   London symbols use the .LON suffix and are usually quoted in pence (GBX).
 * - Finnhub (FINNHUB_API_KEY, optional): US-listed symbols only on the free
 *   tier, 60 requests/minute. Used for US tickers when configured because the
 *   allowance is far more generous.
 * - EODHD (EODHD_API_KEY, optional): UK unit trusts / OEICs, which aren't
 *   exchange-listed, looked up by ISIN on its EUFUND "exchange". Free tier:
 *   20 requests/day, end-of-day data only. Funds are priced once a day anyway.
 *
 * Neither is labelled real-time in the app.
 */

export class RateLimitError extends Error {}
export class NotFoundError extends Error {}

export interface QuoteRequest {
  symbol: string;
  /** The currency the user says the instrument is quoted in. */
  currency: string;
}

export interface Provider {
  name: string;
  /** Free-tier requests per UTC day, when the provider has a daily cap. */
  dailyLimit?: number;
  supports(symbol: string): boolean;
  quote(req: QuoteRequest, fetcher?: typeof fetch): Promise<MarketPrice>;
  /** Daily closes from `from` (inclusive) to today, newest first. One API call. */
  history?(symbol: string, from: string, fetcher?: typeof fetch): Promise<DailyClose[]>;
}

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace('%', ''));
  return Number.isFinite(n) ? n : null;
};

export function parseAlphaVantageQuote(json: unknown, req: QuoteRequest, now = new Date()): MarketPrice {
  const body = json as Record<string, unknown>;
  if (body?.Note || body?.Information) {
    const msg = String(body.Note ?? body.Information);
    if (/rate limit|requests per|premium|frequency/i.test(msg)) throw new RateLimitError('Alpha Vantage rate limit reached');
    throw new Error(msg.slice(0, 200));
  }
  if (body?.['Error Message']) throw new NotFoundError(`Unknown symbol ${req.symbol}`);
  const q = body?.['Global Quote'] as Record<string, string> | undefined;
  const price = num(q?.['05. price']);
  if (!q || price == null) throw new NotFoundError(`No quote for ${req.symbol}`);
  const day = q['07. latest trading day'];
  const market = marketForSymbol(req.symbol);
  const open = isMarketOpen(market, now);
  const pct = num(q['10. change percent']);
  return {
    symbol: req.symbol,
    price,
    currency: req.currency,
    change: num(q['09. change']),
    change_pct: pct == null ? null : pct / 100,
    // Previous trading day → that day's close; today → a delayed value as of fetch time.
    as_of: day && day < todayInMarket(market, now) ? `${day}T12:00:00.000Z` : now.toISOString(),
    fetched_at: now.toISOString(),
    source: 'Alpha Vantage',
    freshness: day && day < todayInMarket(market, now) ? 'end_of_day' : 'delayed',
    market_open: open,
  };
}

export function parseFinnhubQuote(json: unknown, req: QuoteRequest, now = new Date()): MarketPrice {
  const body = json as Record<string, unknown>;
  if (body?.error) {
    const msg = String(body.error);
    if (/limit/i.test(msg)) throw new RateLimitError('Finnhub rate limit reached');
    throw new Error(msg.slice(0, 200));
  }
  const price = num(body?.c);
  const t = num(body?.t);
  if (price == null || price === 0 || !t) throw new NotFoundError(`No quote for ${req.symbol}`);
  const market = marketForSymbol(req.symbol);
  const pct = num(body?.dp);
  return {
    symbol: req.symbol,
    price,
    currency: req.currency,
    change: num(body?.d),
    change_pct: pct == null ? null : pct / 100,
    as_of: new Date(t * 1000).toISOString(),
    fetched_at: now.toISOString(),
    source: 'Finnhub',
    freshness: 'delayed',
    market_open: isMarketOpen(market, now),
  };
}

/** ISIN: 2-letter country, 9 alphanumerics, 1 check digit (e.g. GB00BG0QP604). */
export const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

/** Fund symbols EODHD handles: a bare ISIN or ISIN.EUFUND. */
export function eodhdFundCode(symbol: string): string | null {
  const s = symbol.toUpperCase();
  const isin = s.endsWith('.EUFUND') ? s.slice(0, -'.EUFUND'.length) : s;
  return ISIN_RE.test(isin) ? `${isin}.EUFUND` : null;
}

/** A daily closing price. */
export interface DailyClose {
  date: string;
  close: number;
}

/** Parses an EODHD /eod response into daily closes, newest first. */
export function parseEodhdRows(json: unknown): DailyClose[] {
  const body = json as Record<string, unknown> | Array<Record<string, unknown>>;
  if (!Array.isArray(body)) {
    const msg = String((body as Record<string, unknown>)?.message ?? (body as Record<string, unknown>)?.error ?? 'Unexpected response');
    if (/limit/i.test(msg)) throw new RateLimitError('EODHD daily limit reached');
    throw new Error(msg.slice(0, 200));
  }
  return body
    .filter((r) => num(r?.close) != null && typeof r?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(r.date)))
    .map((r) => ({ date: String(r.date), close: num(r.close)! }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Parses an EODHD /eod response (any order) into the latest quote. */
export function parseEodhdEod(json: unknown, req: QuoteRequest, now = new Date()): MarketPrice {
  const rows = parseEodhdRows(json);
  if (!rows.length) throw new NotFoundError(`No recent price for ${req.symbol}`);
  const price = rows[0].close;
  const prev = rows[1] ? rows[1].close : null;
  const change = prev == null ? null : price - prev;
  return {
    symbol: req.symbol,
    price,
    currency: req.currency,
    change,
    change_pct: change == null || !prev ? null : change / prev,
    // UK funds are typically valued at midday; the provider only gives the date.
    as_of: `${rows[0].date}T12:00:00.000Z`,
    fetched_at: now.toISOString(),
    source: 'EODHD',
    freshness: 'end_of_day',
    market_open: null,
  };
}

async function getJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  const res = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  // 402 is EODHD's "daily API limit reached".
  if (res.status === 429 || res.status === 402) throw new RateLimitError('Provider rate limit reached');
  if (res.status === 404) throw new NotFoundError('Symbol not found by the provider');
  if (res.status === 403) throw new Error('This API key does not include that symbol');
  if (!res.ok) throw new Error(`Provider returned HTTP ${res.status}`);
  return res.json();
}

export function alphaVantage(apiKey: string): Provider {
  return {
    name: 'Alpha Vantage',
    dailyLimit: 25,
    supports: () => true,
    async quote(req, fetcher = fetch) {
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(req.symbol)}&apikey=${encodeURIComponent(apiKey)}`;
      return parseAlphaVantageQuote(await getJson(url, fetcher), req);
    },
  };
}

export function finnhub(apiKey: string): Provider {
  return {
    name: 'Finnhub',
    // Free tier covers US listings only: plain symbols without an exchange suffix.
    supports: (symbol) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol) && marketForSymbol(symbol) === 'US',
    async quote(req, fetcher = fetch) {
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(req.symbol)}&token=${encodeURIComponent(apiKey)}`;
      return parseFinnhubQuote(await getJson(url, fetcher), req);
    },
  };
}

export function eodhd(apiKey: string): Provider {
  const url = (symbol: string, from: string) =>
    `https://eodhd.com/api/eod/${encodeURIComponent(eodhdFundCode(symbol)!)}?api_token=${encodeURIComponent(apiKey)}&fmt=json&order=d&from=${from}`;
  return {
    name: 'EODHD',
    dailyLimit: 20,
    supports: (symbol) => eodhdFundCode(symbol) != null,
    async quote(req, fetcher = fetch) {
      const from = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
      return parseEodhdEod(await getJson(url(req.symbol, from), fetcher), req);
    },
    async history(symbol, from, fetcher = fetch) {
      return parseEodhdRows(await getJson(url(symbol, from), fetcher));
    },
  };
}

/** Providers in priority order, from server environment variables. */
export function configuredProviders(env: Record<string, string | undefined> = process.env): Provider[] {
  const list: Provider[] = [];
  // Only claims ISINs, so it goes before Alpha Vantage, which accepts anything.
  if (env.EODHD_API_KEY) list.push(eodhd(env.EODHD_API_KEY));
  if (env.FINNHUB_API_KEY) list.push(finnhub(env.FINNHUB_API_KEY));
  if (env.ALPHA_VANTAGE_API_KEY) list.push(alphaVantage(env.ALPHA_VANTAGE_API_KEY));
  return list;
}

export function providerFor(symbol: string, providers: Provider[]): Provider | null {
  return providers.find((p) => p.supports(symbol)) ?? null;
}
