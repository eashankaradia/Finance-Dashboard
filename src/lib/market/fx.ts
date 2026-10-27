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
