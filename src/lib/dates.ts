import type { ISODate } from './types';

// All valuation and transaction dates are calendar dates ('YYYY-MM-DD') with
// no time zone. We do date maths in UTC to avoid DST off-by-one errors.

const DAY_MS = 86_400_000;

export function toUTC(date: ISODate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + days * DAY_MS);
}

export function addMonths(date: ISODate, months: number): ISODate {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return fromUTC(target.getTime());
}

/** Today's date in the UK (Europe/London), as 'YYYY-MM-DD'. */
export function todayISO(now: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now);
}

export function monthKey(date: ISODate): string {
  return date.slice(0, 7);
}

export function yearKey(date: ISODate): string {
  return date.slice(0, 4);
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fromUTC(toUTC(s)) === s;
}

export const PERIODS = ['1M', '3M', '6M', '1Y', 'ALL'] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABELS: Record<Period, string> = {
  '1M': '1M',
  '3M': '3M',
  '6M': '6M',
  '1Y': '1Y',
  ALL: 'All',
};

/** Start date for a period ending today; null for all time. */
export function periodStart(period: Period, today: ISODate = todayISO()): ISODate | null {
  switch (period) {
    case '1M':
      return addMonths(today, -1);
    case '3M':
      return addMonths(today, -3);
    case '6M':
      return addMonths(today, -6);
    case '1Y':
      return addMonths(today, -12);
    case 'ALL':
      return null;
  }
}
