'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isValidISODate, todayISO } from '@/lib/dates';
import { parseAmount } from '@/lib/money';

export type Errors = Record<string, string | null>;

export function requireAmount(value: string, { allowZero = false, allowNegative = false, label = 'Amount' } = {}): [string | null, string | null] {
  const parsed = parseAmount(value);
  if (parsed == null) return [null, `${label} must be a number`];
  const n = Number(parsed);
  if (!allowNegative && n < 0) return [null, `${label} can't be negative`];
  if (!allowZero && n === 0) return [null, `${label} must be more than zero`];
  if (Math.abs(n) >= 1e15) return [null, `${label} is too large`];
  return [parsed, null];
}

export function optionalAmount(value: string, label: string): [string | null, string | null] {
  if (value.trim() === '') return [null, null];
  return requireAmount(value, { allowZero: true, label });
}

export function requireDate(value: string, { allowFuture = false } = {}): string | null {
  if (!isValidISODate(value)) return 'Enter a valid date';
  if (!allowFuture && value > todayISO()) return "Date can't be in the future";
  return null;
}

export function hasErrors(errors: Errors): boolean {
  return Object.values(errors).some(Boolean);
}

export function FormActions({ busy, label, onCancel, extra }: { busy: boolean; label: string; onCancel: () => void; extra?: React.ReactNode }) {
  return (
    <div className="mt-6 flex items-center gap-2">
      {extra}
      <div className="ml-auto flex gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {label}
        </Button>
      </div>
    </div>
  );
}

export const CURRENCIES = ['GBP', 'USD', 'EUR', 'CHF', 'JPY', 'CAD', 'AUD'];
