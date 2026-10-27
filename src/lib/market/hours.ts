// Regular trading hours (local exchange time). Public holidays are not
// modelled, so a holiday shows as "open" with a stale price; the price
// timestamp still tells the truth.

export type Market = 'LSE' | 'US' | 'OTHER';

const HOURS: Record<Exclude<Market, 'OTHER'>, { tz: string; open: number; close: number }> = {
  LSE: { tz: 'Europe/London', open: 8 * 60, close: 16 * 60 + 30 },
  US: { tz: 'America/New_York', open: 9 * 60 + 30, close: 16 * 60 },
};

export function marketForSymbol(symbol: string): Market {
  const s = symbol.toUpperCase();
  if (s.endsWith('.LON') || s.endsWith('.L') || s.startsWith('LON:')) return 'LSE';
  if (/^[A-Z][A-Z0-9\-]{0,9}(\.[AB])?$/.test(s)) return 'US';
  return 'OTHER';
}

function localParts(tz: string, now: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { weekday: get('weekday'), minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

export function isMarketOpen(market: Market, now = new Date()): boolean | null {
  if (market === 'OTHER') return null;
  const h = HOURS[market];
  const { weekday, minutes } = localParts(h.tz, now);
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  return minutes >= h.open && minutes < h.close;
}

export function todayInMarket(market: Market, now = new Date()): string {
  const tz = market === 'US' ? 'America/New_York' : 'Europe/London';
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
}
