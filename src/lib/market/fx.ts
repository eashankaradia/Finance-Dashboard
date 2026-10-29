import type { FxRates } from '../finance/fx';

/**
 * Exchange rates from Frankfurter (European Central Bank reference rates,
 * free, no API key, published once per working day). Converted to
 * "GBP per unit" for the app.
 */
export function parseFrankfurter(json: unknown): { rates: FxRates; asOf: string } {
  const body = json as { base?: string; date?: string; rates?: Record<string, number> };
  if (body?.base !== 'GBP' || !body.rates) throw new Error('Unexpected FX response');
  const rates: FxRates = {};
  for (const [ccy, perGbp] of Object.entries(body.rates)) {
    if (perGbp > 0) rates[ccy] = 1 / perGbp;
  }
  return { rates, asOf: body.date ?? '' };
}

export async function fetchFxRates(fetcher: typeof fetch = fetch): Promise<{ rates: FxRates; asOf: string }> {
  const res = await fetcher('https://api.frankfurter.dev/v1/latest?base=GBP', {
    next: { revalidate: 6 * 3600 },
    signal: AbortSignal.timeout(8000),
  } as RequestInit);
  if (!res.ok) throw new Error(`FX provider returned HTTP ${res.status}`);
  return parseFrankfurter(await res.json());
}

/** Symbol under which daily rates are stored in price_history: GBP per unit of `ccy`. */
export const fxHistorySymbol = (ccy: string) => `FX:${ccy.toUpperCase()}GBP`;

/** Parses a Frankfurter time series (base GBP) into daily GBP-per-unit closes, newest first. */
export function parseFrankfurterSeries(json: unknown, ccy: string): { date: string; close: number }[] {
  const body = json as { base?: string; rates?: Record<string, Record<string, number>> };
  if (body?.base !== 'GBP' || !body.rates) throw new Error('Unexpected FX response');
  return Object.entries(body.rates)
    .map(([date, r]) => ({ date, perGbp: r[ccy.toUpperCase()] }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.perGbp > 0)
    .map((r) => ({ date: r.date, close: Math.round((1 / r.perGbp) * 1e8) / 1e8 }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Daily ECB reference rates for one currency against GBP, from `from` to today. */
export async function fetchFxHistory(ccy: string, from: string, fetcher: typeof fetch = fetch): Promise<{ date: string; close: number }[]> {
  const res = await fetcher(`https://api.frankfurter.dev/v1/${from}..?base=GBP&symbols=${encodeURIComponent(ccy.toUpperCase())}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  } as RequestInit);
  if (!res.ok) throw new Error(`FX provider returned HTTP ${res.status}`);
  return parseFrankfurterSeries(await res.json(), ccy);
}
