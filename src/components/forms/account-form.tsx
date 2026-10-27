'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { useData } from '@/components/providers/data-provider';
import { todayISO } from '@/lib/dates';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, type Account, type AccountType } from '@/lib/types';
import { CURRENCIES, FormActions, hasErrors, optionalAmount, requireAmount, requireDate, type Errors } from './shared';

export function AccountDialog({ open, onOpenChange, account }: { open: boolean; onOpenChange: (o: boolean) => void; account?: Account }) {
  const { insert, update } = useData();
  const router = useRouter();
  const [form, setForm] = React.useState(() => initial(account));
  const [errors, setErrors] = React.useState<Errors>({});
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setForm(initial(account));
      setErrors({});
    }
  }, [open, account]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const [cash, cashErr] = form.cash_balance.trim() ? requireAmount(form.cash_balance, { allowZero: true, label: 'Cash balance' }) : ['0', null];
    const [opening, openingErr] = account ? [null, null] : optionalAmount(form.opening_value, 'Current value');
    const errs: Errors = {
      name: form.name.trim() ? null : 'Give the account a name',
      opened_on: form.opened_on ? requireDate(form.opened_on) : null,
      cash_balance: cashErr,
      opening_value: openingErr,
    };
    setErrors(errs);
    if (hasErrors(errs)) return;
    setBusy(true);
    const row = {
      name: form.name.trim(),
      provider: form.provider.trim() || null,
      account_type: form.account_type as AccountType,
      reference: form.reference.trim() || null,
      currency: form.currency,
      opened_on: form.opened_on || null,
      notes: form.notes.trim() || null,
      valuation_mode: form.valuation_mode as Account['valuation_mode'],
      cash_balance: Number(cash),
    };
    if (account) {
      if (await update('accounts', account.id, row, 'Account updated')) onOpenChange(false);
    } else {
      const created = await insert('accounts', { ...row, is_archived: false }, 'Account created');
      if (created && opening && Number(opening) > 0) {
        await insert('snapshots', { account_id: created.id, valued_on: todayISO(), value: Number(opening), notes: 'Initial valuation' });
      }
      if (created) {
        onOpenChange(false);
        router.push(`/accounts/${created.id}`);
      }
    }
    setBusy(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={account ? 'Edit account' : 'New account'} description={account ? undefined : 'Add an ISA, pension, savings account or any other pot.'}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Account name" htmlFor="acc-name" error={errors.name}>
            <Input id="acc-name" value={form.name} onChange={set('name')} placeholder="e.g. Vanguard ISA" autoFocus aria-invalid={!!errors.name} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" htmlFor="acc-type">
              <NativeSelect id="acc-type" value={form.account_type} onChange={set('account_type')}>
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ACCOUNT_TYPE_LABELS[t]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Provider" htmlFor="acc-provider">
              <Input id="acc-provider" value={form.provider} onChange={set('provider')} placeholder="e.g. Hargreaves Lansdown" />
            </Field>
          </div>
          <Field
            label="How is the value tracked?"
            htmlFor="acc-mode"
            hint={
              form.valuation_mode === 'snapshot'
                ? 'You record the total value from time to time. Holdings can still be listed for information.'
                : 'Value is calculated from your holdings at market prices plus the cash balance below.'
            }
          >
            <NativeSelect id="acc-mode" value={form.valuation_mode} onChange={set('valuation_mode')}>
              <option value="snapshot">Manual valuations (snapshots)</option>
              <option value="holdings">Calculated from holdings</option>
            </NativeSelect>
          </Field>
          {form.valuation_mode === 'holdings' ? (
            <Field label="Uninvested cash" htmlFor="acc-cash" error={errors.cash_balance}>
              <Input id="acc-cash" inputMode="decimal" value={form.cash_balance} onChange={set('cash_balance')} placeholder="0.00" />
            </Field>
          ) : !account ? (
            <Field label="Current value (optional)" htmlFor="acc-open" error={errors.opening_value} hint="Saved as today's first snapshot.">
              <Input id="acc-open" inputMode="decimal" value={form.opening_value} onChange={set('opening_value')} placeholder="0.00" />
            </Field>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency" htmlFor="acc-ccy">
              <NativeSelect id="acc-ccy" value={form.currency} onChange={set('currency')}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Date opened" htmlFor="acc-opened" error={errors.opened_on}>
              <Input id="acc-opened" type="date" value={form.opened_on} max={todayISO()} onChange={set('opened_on')} />
            </Field>
          </div>
          <Field label="Account number / reference" htmlFor="acc-ref" hint="Private to you. Shown masked in lists.">
            <Input id="acc-ref" value={form.reference} onChange={set('reference')} autoComplete="off" />
          </Field>
          <Field label="Notes" htmlFor="acc-notes">
            <Textarea id="acc-notes" value={form.notes} onChange={set('notes')} rows={2} />
          </Field>
          <FormActions busy={busy} label={account ? 'Save changes' : 'Create account'} onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function initial(a?: Account) {
  return {
    name: a?.name ?? '',
    provider: a?.provider ?? '',
    account_type: a?.account_type ?? 'stocks_shares_isa',
    reference: a?.reference ?? '',
    currency: a?.currency ?? 'GBP',
    opened_on: a?.opened_on ?? '',
    notes: a?.notes ?? '',
    valuation_mode: a?.valuation_mode ?? 'snapshot',
    cash_balance: a ? String(a.cash_balance ?? 0) : '',
    opening_value: '',
  };
}
