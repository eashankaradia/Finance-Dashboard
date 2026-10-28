import 'server-only';
import type { Db } from '@/lib/supabase/types';
import { addDays, todayISO } from '../dates';
import { normaliseRow, TABLES, type Collection } from '../data/repository';
import { buildPortfolio } from '../finance/portfolio';
import type { Dataset, MarketPrice } from '../types';
import { fetchFxRates } from './fx';
import { configuredProviders, providerFor, RateLimitError, type DailyClose } from './providers';
import { getPrices, recordApiCalls } from './service';

/**
 * Daily job (run by Vercel Cron on weekday evenings, see vercel.json):
 *
 * 1. Price history: for every symbol held or watched by anyone, store daily
 *    closes in finance.price_history. Providers with a history endpoint
 *    (EODHD funds) backfill up to a year on the first run and then fetch
 *    only the missing days, one request per symbol. Others store today's
 *    quote as that day's close. About once a month it also asks for anything
 *    older than what's stored, which a paid plan can supply (EODHD's free
 *    plan stops at one year, so that request comes back empty or refused).
 * 2. Valuations: for every account valued from holdings, save today's
 *    calculated value as a snapshot, unless one already exists for today.
 *    This builds the account's value history without opening the app.
 *
 * Runs with the service role (bypasses RLS), so it handles every user.
 */

export interface DailyResult {
  date: string;
  prices: Record<string, string>;
  olderHistory: Record<string, string>;
  snapshots: { account_id: string; value: number }[];
  skippedAccounts: number;
}

const BACKFILL_DAYS = 365;
const OLDER_HISTORY_FROM = '1990-01-01';
const OLDER_HISTORY_RETRY_DAYS = 30;

async function lastStoredDates(db: Db, symbols: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const symbol of symbols) {
    const { data } = await db.from('price_history').select('price_date').eq('symbol', symbol).order('price_date', { ascending: false }).limit(1);
    if (data?.[0]) out.set(symbol, data[0].price_date);
  }
  return out;
}

async function earliestStoredDate(db: Db, symbol: string): Promise<string | null> {
  const { data } = await db.from('price_history').select('price_date').eq('symbol', symbol).order('price_date', { ascending: true }).limit(1);
  return data?.[0]?.price_date ?? null;
}

async function storeCloses(db: Db, symbol: string, rows: DailyClose[], source: string): Promise<void> {
  if (!rows.length) return;
  const { error } = await db
    .from('price_history')
    .upsert(rows.map((r) => ({ symbol, price_date: r.date, close: r.close, source, fetched_at: new Date().toISOString() })), { onConflict: 'symbol,price_date' });
  if (error) throw new Error(error.message);
}

export async function runDailyUpdate(db: Db, today = todayISO()): Promise<DailyResult> {
  const result: DailyResult = { date: today, prices: {}, olderHistory: {}, snapshots: [], skippedAccounts: 0 };

  // Everyone's data, grouped by user below.
  const tables = await Promise.all(
    (['accounts', 'snapshots', 'transactions', 'assets', 'holdings'] as Collection[]).map(async (c) => {
      const { data, error } = await db.from(TABLES[c]).select('*');
      if (error) throw new Error(error.message);
      return [c, (data ?? []).map(normaliseRow)] as const;
    }),
  );
  const all = Object.fromEntries(tables) as unknown as Record<'accounts' | 'snapshots' | 'transactions' | 'assets' | 'holdings', Array<Record<string, unknown> & { user_id: string }>>;

  // 1. Price history.
  const assets = all.assets.filter((a) => a.symbol && a.price_mode === 'market');
  const currencyBySymbol = new Map<string, string>();
  for (const a of assets) currencyBySymbol.set(String(a.symbol).toUpperCase(), String(a.currency));
  const symbols = [...currencyBySymbol.keys()];
  const providers = configuredProviders();
  const last = await lastStoredDates(db, symbols);

  const quoteOnly: { symbol: string; currency: string }[] = [];
  for (const symbol of symbols) {
    const provider = providerFor(symbol, providers);
    if (!provider) {
      result.prices[symbol] = 'no provider';
      continue;
    }
    if (!provider.history) {
      quoteOnly.push({ symbol, currency: currencyBySymbol.get(symbol)! });
      continue;
    }
    const lastDate = last.get(symbol);
    if (lastDate && lastDate >= today) {
      result.prices[symbol] = 'up to date';
      continue;
    }
    const from = lastDate ? addDays(lastDate, 1) : addDays(today, -BACKFILL_DAYS);
    try {
      await recordApiCalls(db, new Map([[provider.name, 1]]));
      const rows = await provider.history(symbol, from);
      await storeCloses(db, symbol, rows, provider.name);
      // The first backfill already asked for as much as the plan gives, so
      // leave older history for a month.
      if (!lastDate) {
        await db
          .from('price_history_checks')
          .upsert({ symbol, checked_at: new Date().toISOString(), earliest: rows[rows.length - 1]?.date ?? null, result: 'initial backfill' }, { onConflict: 'symbol' });
      }
      if (rows[0]) {
        const latest: MarketPrice = {
          symbol,
          price: rows[0].close,
          currency: currencyBySymbol.get(symbol)!,
          change: rows[1] ? rows[0].close - rows[1].close : null,
          change_pct: rows[1] && rows[1].close ? rows[0].close / rows[1].close - 1 : null,
          as_of: `${rows[0].date}T12:00:00.000Z`,
          fetched_at: new Date().toISOString(),
          source: provider.name,
          freshness: 'end_of_day',
          market_open: null,
        };
        await db.from('market_prices').upsert(latest, { onConflict: 'symbol' });
      }
      result.prices[symbol] = `${rows.length} day(s) stored`;
    } catch (e) {
      result.prices[symbol] = e instanceof Error ? e.message : 'failed';
    }
  }

  // 1b. Older history, at most monthly per symbol.
  const { data: checks } = await db.from('price_history_checks').select('*').in('symbol', symbols.length ? symbols : ['-']);
  const lastCheck = new Map((checks ?? []).map((c) => [String(c.symbol), String(c.checked_at).slice(0, 10)]));
  for (const symbol of symbols) {
    const provider = providerFor(symbol, providers);
    if (!provider?.history) continue;
    const checked = lastCheck.get(symbol);
    if (checked && checked > addDays(today, -OLDER_HISTORY_RETRY_DAYS)) continue;
    const earliest = await earliestStoredDate(db, symbol);
    if (!earliest) continue;
    let outcome: string;
    try {
      await recordApiCalls(db, new Map([[provider.name, 1]]));
      const rows = (await provider.history(symbol, OLDER_HISTORY_FROM, undefined, addDays(earliest, -1))).filter((r) => r.date < earliest);
      await storeCloses(db, symbol, rows, provider.name);
      outcome = rows.length ? `${rows.length} older day(s) stored` : 'no older history available';
    } catch (e) {
      // Out of requests today: try again tomorrow rather than next month.
      if (e instanceof RateLimitError) {
        result.olderHistory[symbol] = e.message;
        continue;
      }
      outcome = `older history: ${e instanceof Error ? e.message : 'failed'}`;
    }
    await db.from('price_history_checks').upsert({ symbol, checked_at: new Date().toISOString(), earliest, result: outcome.slice(0, 200) }, { onConflict: 'symbol' });
    result.olderHistory[symbol] = outcome;
  }

  if (quoteOnly.length) {
    const quotes = await getPrices(quoteOnly, { force: true, reader: db, writer: db });
    for (const { symbol } of quoteOnly) {
      const p = quotes.prices[symbol];
      const status = quotes.statuses[symbol];
      if (p && (status === 'fresh' || status === 'cached')) {
        await storeCloses(db, symbol, [{ date: p.as_of.slice(0, 10), close: p.price }], p.source);
        result.prices[symbol] = 'quote stored';
      } else {
        result.prices[symbol] = quotes.messages[symbol] ?? status ?? 'failed';
      }
    }
  }

  // 2. Daily valuations for accounts valued from holdings, per user.
  const { data: cached } = await db.from('market_prices').select('*').in('symbol', symbols.length ? symbols : ['-']);
  const prices = Object.fromEntries((cached ?? []).map((p) => [p.symbol, normaliseRow(p) as MarketPrice]));
  let rates = {};
  try {
    rates = (await fetchFxRates()).rates;
  } catch {
    // Without FX, non-GBP holdings are valued unconverted; GBP/GBX are exact.
  }

  const users = new Set(all.accounts.filter((a) => a.valuation_mode === 'holdings' && !a.is_archived).map((a) => a.user_id));
  for (const userId of users) {
    const mine = <K extends keyof typeof all>(k: K) => all[k].filter((r) => r.user_id === userId);
    const data = {
      accounts: mine('accounts'),
      snapshots: mine('snapshots'),
      transactions: mine('transactions'),
      assets: mine('assets'),
      holdings: mine('holdings'),
      cards: [],
      bills: [],
    } as unknown as Dataset;
    const model = buildPortfolio({ data, prices, rates, today });
    for (const m of model.accounts) {
      if (m.valueSource !== 'calculated' || m.account.is_archived) continue;
      const hasToday = data.snapshots.some((s) => s.account_id === m.account.id && s.valued_on === today);
      const unpriced = m.positions.some((p) => p.price.price == null && p.units > 0);
      if (hasToday || m.positions.length === 0 || unpriced) {
        result.skippedAccounts++;
        continue;
      }
      const { error } = await db.from('account_snapshots').insert({
        user_id: userId,
        account_id: m.account.id,
        valued_on: today,
        value: m.currentValue,
        notes: 'Automatic daily valuation',
      });
      if (error) throw new Error(error.message);
      result.snapshots.push({ account_id: m.account.id, value: m.currentValue });
    }
  }
  return result;
}
