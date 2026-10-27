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
  supports(symbol: string): boolean;
  quote(req: QuoteRequest, fetcher?: typeof fetch): Promise<MarketPrice>;
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

async function getJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  const res = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (res.status === 429) throw new RateLimitError('Provider rate limit reached');
  if (!res.ok) throw new Error(`Provider returned HTTP ${res.status}`);
  return res.json();
}

export function alphaVantage(apiKey: string): Provider {
  return {
    name: 'Alpha Vantage',
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

/** Providers in priority order, from server environment variables. */
export function configuredProviders(env: Record<string, string | undefined> = process.env): Provider[] {
  const list: Provider[] = [];
  if (env.FINNHUB_API_KEY) list.push(finnhub(env.FINNHUB_API_KEY));
  if (env.ALPHA_VANTAGE_API_KEY) list.push(alphaVantage(env.ALPHA_VANTAGE_API_KEY));
  return list;
}

export function providerFor(symbol: string, providers: Provider[]): Provider | null {
  return providers.find((p) => p.supports(symbol)) ?? null;
}
