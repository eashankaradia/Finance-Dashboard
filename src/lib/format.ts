import type { ISODate, ISODateTime } from './types';

const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number | null | undefined, currency = 'GBP', opts: { compact?: boolean; sign?: boolean } = {}): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  if (currency === 'GBX') return formatPence(amount);
  const key = `${currency}|${opts.compact ? 'c' : ''}|${opts.sign ? 's' : ''}`;
  let f = currencyFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      minimumFractionDigits: opts.compact ? 0 : 2,
      maximumFractionDigits: opts.compact ? 1 : 2,
      notation: opts.compact ? 'compact' : 'standard',
      signDisplay: opts.sign ? 'exceptZero' : 'auto',
    });
    currencyFormatters.set(key, f);
  }
  return f.format(amount);
}

export function formatPence(pence: number): string {
  return `${pence.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}p`;
}

/** Format a unit price in its quote currency (GBX shown as pence). */
export function formatPrice(price: number | null | undefined, currency: string): string {
  if (price == null) return '—';
  if (currency === 'GBX') return formatPence(price);
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(price);
}

export function formatPercent(value: number | null | undefined, opts: { sign?: boolean; dp?: number } = {}): string {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) return '—';
  const dp = opts.dp ?? 2;
  const sign = opts.sign !== false && value > 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(dp)}%`;
}

export function formatUnits(units: number | null | undefined): string {
  if (units == null) return '—';
  return units.toLocaleString('en-GB', { maximumFractionDigits: 6 });
}

export function formatDate(date: ISODate | null | undefined, style: 'short' | 'medium' | 'long' = 'medium'): string {
  if (!date) return '—';
  const d = new Date(date + 'T00:00:00Z');
  const opts: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { day: 'numeric', month: 'short', timeZone: 'UTC' }
      : style === 'long'
        ? { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
        : { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
  return d.toLocaleDateString('en-GB', opts);
}

export function formatMonth(key: string): string {
  const d = new Date(key + '-01T00:00:00Z');
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function formatDateTime(ts: ISODateTime | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });
}

export function relativeTime(ts: ISODateTime | null | undefined, now = Date.now()): string {
  if (!ts) return 'never';
  const diff = Math.round((now - new Date(ts).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

export function gainClass(v: number | null | undefined): string {
  if (v == null || v === 0) return 'text-muted-foreground';
  return v > 0 ? 'text-gain' : 'text-loss';
}
