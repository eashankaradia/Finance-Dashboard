import 'server-only';
import type { Db } from '@/lib/supabase/types';
import type { MarketPrice } from '../types';
import { isMarketOpen, marketForSymbol } from './hours';
import { configuredProviders, NotFoundError, providerFor, RateLimitError, type Provider, type QuoteRequest } from './providers';

export type QuoteStatus = 'fresh' | 'cached' | 'stale' | 'rate_limited' | 'not_found' | 'error' | 'no_provider';

export interface ProviderUsage {
  provider: string;
  used: number;
  limit: number;
}

export interface PricesResponse {
  prices: Record<string, MarketPrice>;
  statuses: Record<string, QuoteStatus>;
  messages: Record<string, string>;
  providers: string[];
  /** Today's (UTC) calls against each daily-capped provider. */
  usage: ProviderUsage[];
}

/** Adds this run's provider calls to today's shared counter (service role only). */
export async function recordApiCalls(writer: Db | null | undefined, calls: Map<string, number>): Promise<void> {
  if (!writer) return;
  for (const [provider, count] of calls) {
    if (count > 0) await writer.rpc('record_api_calls', { p_provider: provider, p_count: count });
  }
}

/** Today's (UTC) usage for each configured provider that has a daily cap. */
export async function readApiUsage(reader: Db | null | undefined, providers: Provider[]): Promise<ProviderUsage[]> {
  const capped = providers.filter((p) => p.dailyLimit);
  if (!reader || capped.length === 0) return [];
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await reader.from('api_usage').select('provider, calls').eq('usage_date', today);
  const used = new Map((data ?? []).map((r) => [r.provider as string, Number(r.calls)]));
  return capped.map((p) => ({ provider: p.name, used: used.get(p.name) ?? 0, limit: p.dailyLimit! }));
}

// Cache lifetime: short while the market is open, longer when it is closed.
const TTL_OPEN_MS = 15 * 60 * 1000;
const TTL_CLOSED_MS = 6 * 60 * 60 * 1000;
// Alpha Vantage free tier allows 5 requests/minute: never fire more per call.
const MAX_FETCHES_PER_REQUEST = 5;
// Per-instance throttle. Serverless instances do not share memory, so this is
// best-effort; the shared Supabase cache is what really limits API usage.
const MIN_INTERVAL_MS = 12_000;

const memoryCache = new Map<string, MarketPrice>();
const lastFetchBySymbol = new Map<string, number>();

function isFresh(p: MarketPrice, now: number): boolean {
  const open = isMarketOpen(marketForSymbol(p.symbol), new Date(now));
  const ttl = open ? TTL_OPEN_MS : TTL_CLOSED_MS;
  return now - new Date(p.fetched_at).getTime() < ttl;
}

export async function getPrices(
  requests: QuoteRequest[],
  opts: { force?: boolean; reader?: Db | null; writer?: Db | null; fetcher?: typeof fetch } = {},
): Promise<PricesResponse> {
  const now = Date.now();
  const providers = configuredProviders();
  const out: PricesResponse = { prices: {}, statuses: {}, messages: {}, providers: providers.map((p) => p.name), usage: [] };
  const calls = new Map<string, number>();

  // 1. Shared cache in Supabase, then this instance's memory.
  const symbols = requests.map((r) => r.symbol);
  if (opts.reader && symbols.length) {
    const { data } = await opts.reader.from('market_prices').select('*').in('symbol', symbols);
    for (const row of data ?? []) {
      const p = { ...row, price: Number(row.price), change: row.change == null ? null : Number(row.change), change_pct: row.change_pct == null ? null : Number(row.change_pct) } as MarketPrice;
      const mem = memoryCache.get(p.symbol);
      if (!mem || mem.fetched_at < p.fetched_at) memoryCache.set(p.symbol, p);
    }
  }

  // 2. Decide what to fetch.
  const toFetch: QuoteRequest[] = [];
  for (const req of requests) {
    const cached = memoryCache.get(req.symbol);
    if (cached) out.prices[req.symbol] = { ...cached, currency: req.currency };
    const recentlyTried = now - (lastFetchBySymbol.get(req.symbol) ?? 0) < MIN_INTERVAL_MS;
    if (cached && (isFresh(cached, now) || recentlyTried) && !(opts.force && !recentlyTried)) {
      out.statuses[req.symbol] = 'cached';
      continue;
    }
    if (!providerFor(req.symbol, providers)) {
      out.statuses[req.symbol] = cached ? 'stale' : 'no_provider';
      out.messages[req.symbol] = providers.length === 0 ? 'No market data API key configured' : 'Symbol not supported by the configured providers';
      continue;
    }
    if (toFetch.length >= MAX_FETCHES_PER_REQUEST) {
      out.statuses[req.symbol] = cached ? 'stale' : 'rate_limited';
      out.messages[req.symbol] = 'Deferred to respect provider rate limits; refresh again in a minute';
      continue;
    }
    toFetch.push(req);
  }

  // 3. Fetch sequentially (keeps us under per-second limits).
  const fetched: MarketPrice[] = [];
  let rateLimited = false;
  for (const req of toFetch) {
    const cached = memoryCache.get(req.symbol);
    if (rateLimited) {
      out.statuses[req.symbol] = cached ? 'stale' : 'rate_limited';
      out.messages[req.symbol] = 'Provider rate limit reached';
      continue;
    }
    lastFetchBySymbol.set(req.symbol, now);
    try {
      const provider = providerFor(req.symbol, providers)!;
      calls.set(provider.name, (calls.get(provider.name) ?? 0) + 1);
      const p = await provider.quote(req, opts.fetcher);
      memoryCache.set(req.symbol, p);
      out.prices[req.symbol] = p;
      out.statuses[req.symbol] = 'fresh';
      fetched.push(p);
    } catch (e) {
      if (e instanceof RateLimitError) {
        rateLimited = true;
        out.statuses[req.symbol] = cached ? 'stale' : 'rate_limited';
      } else if (e instanceof NotFoundError) {
        out.statuses[req.symbol] = cached ? 'stale' : 'not_found';
      } else {
        out.statuses[req.symbol] = cached ? 'stale' : 'error';
      }
      out.messages[req.symbol] = e instanceof Error ? e.message : 'Price lookup failed';
    }
  }

  // 4. Write fresh quotes to the shared cache.
  if (opts.writer && fetched.length) {
    await opts.writer.from('market_prices').upsert(fetched, { onConflict: 'symbol' });
  }
  await recordApiCalls(opts.writer, calls);
  out.usage = await readApiUsage(opts.reader, providers);
  return out;
}
