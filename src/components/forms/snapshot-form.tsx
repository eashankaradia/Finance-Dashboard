'use client';

import * as React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Notice } from '@/components/common';
import { useData } from '@/components/providers/data-provider';
import { todayISO } from '@/lib/dates';
import { formatDate, formatMoney } from '@/lib/format';
import type { Snapshot } from '@/lib/types';
import { FormActions, hasErrors, requireAmount, requireDate, type Errors } from './shared';

export function SnapshotDialog({
  open,
  onOpenChange,
  snapshot,
  accountId,
  suggestedValue,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  snapshot?: Snapshot;
  accountId?: string;
  suggestedValue?: number;
}) {
  const { data, insert, update } = useData();
  const accounts = data.accounts.filter((a) => !a.is_archived || a.id === (snapshot?.account_id ?? accountId));
  const [form, setForm] = React.useState({ account_id: '', valued_on: todayISO(), value: '', notes: '' });
  const [errors, setErrors] = React.useState<Errors>({});
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      snapshot
        ? { account_id: snapshot.account_id, valued_on: snapshot.valued_on, value: String(snapshot.value), notes: snapshot.notes ?? '' }
        : { account_id: accountId ?? accounts[0]?.id ?? '', valued_on: todayISO(), value: suggestedValue != null ? suggestedValue.toFixed(2) : '', notes: '' },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, snapshot, accountId]);

  const account = data.accounts.find((a) => a.id === form.account_id);
  const sameDay = !snapshot && data.snapshots.find((s) => s.account_id === form.account_id && s.valued_on === form.valued_on);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const [value, valueErr] = requireAmount(form.value, { allowZero: true, label: 'Value' });
    const errs = { account_id: form.account_id ? null : 'Choose an account', valued_on: requireDate(form.valued_on), value: valueErr };
    setErrors(errs);
    if (hasErrors(errs)) return;
    setBusy(true);
    const row = { account_id: form.account_id, valued_on: form.valued_on, value: Number(value), notes: form.notes.trim() || null };
    const ok = snapshot ? await update('snapshots', snapshot.id, row, 'Snapshot updated') : await insert('snapshots', row, 'Valuation recorded');
    setBusy(false);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={snapshot ? 'Edit valuation' : 'Record a valuation'} description={snapshot ? undefined : 'The total value of an account on a date. Older valuations are kept.'}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Account" htmlFor="snap-acc" error={errors.account_id}>
            <NativeSelect id="snap-acc" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })} disabled={!!snapshot}>
              {accounts.length === 0 ? <option value="">Create an account first</option> : null}
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valuation date" htmlFor="snap-date" error={errors.valued_on}>
              <Input id="snap-date" type="date" max={todayISO()} value={form.valued_on} onChange={(e) => setForm({ ...form, valued_on: e.target.value })} />
            </Field>
            <Field label={`Total value (${account?.currency ?? 'GBP'})`} htmlFor="snap-value" error={errors.value}>
              <Input id="snap-value" inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="0.00" autoFocus aria-invalid={!!errors.value} />
            </Field>
          </div>
          {sameDay ? (
            <Notice>
              There&apos;s already a valuation of {formatMoney(sameDay.value, account?.currency)} on {formatDate(sameDay.valued_on)}. Both are kept; the newest one is used for that day.
            </Notice>
          ) : null}
          {account?.valuation_mode === 'holdings' ? (
            <Notice>This account&apos;s current value is calculated from holdings. Snapshots record its history for charts and returns.</Notice>
          ) : null}
          <Field label="Notes" htmlFor="snap-notes">
            <Textarea id="snap-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
          </Field>
          <FormActions busy={busy} label={snapshot ? 'Save' : 'Record valuation'} onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
