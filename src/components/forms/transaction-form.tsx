'use client';

import * as React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Notice } from '@/components/common';
import { useData } from '@/components/providers/data-provider';
import { todayISO } from '@/lib/dates';
import { D } from '@/lib/money';
import { TRANSACTION_TYPE_LABELS, type Transaction, type TransactionType } from '@/lib/types';
import { FormActions, hasErrors, optionalAmount, requireAmount, requireDate, type Errors } from './shared';

type FormType = Exclude<TransactionType, 'transfer_in' | 'transfer_out'> | 'transfer';

const TYPE_OPTIONS: { value: FormType; label: string }[] = [
  { value: 'deposit', label: 'Contribution / deposit' },
  { value: 'withdrawal', label: 'Withdrawal' },
  { value: 'transfer', label: 'Transfer between my accounts' },
  { value: 'buy', label: 'Buy investment' },
  { value: 'sell', label: 'Sell investment' },
  { value: 'dividend', label: 'Dividend' },
  { value: 'interest', label: 'Interest / prize' },
  { value: 'fee', label: 'Fee' },
  { value: 'adjustment', label: 'Other adjustment' },
];

const TYPE_HELP: Record<FormType, string> = {
  deposit: 'New money you paid in. Counts as a contribution.',
  withdrawal: 'Money taken out of your investments. Counts as a withdrawal.',
  transfer: 'Moves money between two of your accounts. Not counted as a contribution or withdrawal overall.',
  buy: 'Trading inside the account. Not a contribution; updates the holding if linked.',
  sell: 'Trading inside the account. Not a withdrawal; realised gain is calculated if linked.',
  dividend: 'Investment income kept in the account. Part of your return, not a contribution.',
  interest: 'Interest, bonus or prize kept in the account. Part of your return.',
  fee: 'Charges taken from the account. Reduces your return.',
  adjustment: 'Any other correction. Not counted as a contribution or withdrawal. May be negative.',
};

export function TransactionDialog({
  open,
  onOpenChange,
  transaction,
  accountId,
  holdingId,
  defaultType = 'deposit',
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  transaction?: Transaction;
  accountId?: string;
  holdingId?: string;
  defaultType?: FormType;
}) {
  const { data, insert, update, createTransfer } = useData();
  const accounts = data.accounts.filter((a) => !a.is_archived || a.id === transaction?.account_id);
  const isTransferLeg = transaction?.transfer_group_id != null;
  const [form, setForm] = React.useState(empty());
  const [errors, setErrors] = React.useState<Errors>({});
  const [busy, setBusy] = React.useState(false);

  function empty() {
    return {
      type: defaultType as FormType,
      account_id: accountId ?? '',
      to_account_id: '',
      occurred_on: todayISO(),
      amount: '',
      description: '',
      holding_id: holdingId ?? '',
      units: '',
      price_per_unit: '',
      fees: '',
    };
  }

  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    if (transaction) {
      setForm({
        type: isTransferLeg ? 'transfer' : (transaction.type as FormType),
        account_id: transaction.account_id,
        to_account_id: '',
        occurred_on: transaction.occurred_on,
        amount: String(transaction.amount),
        description: transaction.description ?? '',
        holding_id: transaction.holding_id ?? '',
        units: transaction.units != null ? String(transaction.units) : '',
        price_per_unit: transaction.price_per_unit != null ? String(transaction.price_per_unit) : '',
        fees: transaction.fees != null ? String(transaction.fees) : '',
      });
    } else {
      const f = empty();
      const firstAccount = accountId ?? (holdingId ? data.holdings.find((h) => h.id === holdingId)?.account_id : undefined) ?? accounts[0]?.id ?? '';
      setForm({ ...f, account_id: firstAccount, to_account_id: accounts.find((a) => a.id !== firstAccount)?.id ?? '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction]);

  const account = data.accounts.find((a) => a.id === form.account_id);
  const ccy = account?.currency ?? 'GBP';
  const holdings = data.holdings.filter((h) => h.account_id === form.account_id);
  const assetFor = (assetId: string) => data.assets.find((a) => a.id === assetId);
  const selectedHolding = data.holdings.find((h) => h.id === form.holding_id);
  const selectedAsset = selectedHolding ? assetFor(selectedHolding.asset_id) : undefined;
  const isTrade = form.type === 'buy' || form.type === 'sell';
  const canLinkHolding = isTrade || form.type === 'dividend' || form.type === 'fee';

  // Suggest the cash amount from units × price when the currencies line up.
  const suggested = React.useMemo(() => {
    if (!isTrade || !form.units || !form.price_per_unit || !selectedAsset) return null;
    try {
      const gross = D(form.units).times(D(form.price_per_unit));
      if (selectedAsset.currency === ccy) return gross.toDecimalPlaces(2).toString();
      if (selectedAsset.currency === 'GBX' && ccy === 'GBP') return gross.dividedBy(100).toDecimalPlaces(2).toString();
    } catch {
      return null;
    }
    return null;
  }, [isTrade, form.units, form.price_per_unit, selectedAsset, ccy]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amountInput = form.amount.trim() === '' && suggested ? suggested : form.amount;
    const [amount, amountErr] = requireAmount(amountInput, { allowNegative: form.type === 'adjustment' });
    const [units, unitsErr] = isTrade ? (form.holding_id ? requireAmount(form.units, { label: 'Units' }) : optionalAmount(form.units, 'Units')) : [null, null];
    const [price, priceErr] = isTrade ? optionalAmount(form.price_per_unit, 'Price') : [null, null];
    const [fees, feesErr] = isTrade ? optionalAmount(form.fees, 'Fees') : [null, null];
    const errs: Errors = {
      account_id: form.account_id ? null : 'Choose an account',
      to_account_id: form.type === 'transfer' && !transaction ? (!form.to_account_id ? 'Choose an account' : form.to_account_id === form.account_id ? 'Choose a different account' : null) : null,
      occurred_on: requireDate(form.occurred_on),
      amount: amountErr,
      units: unitsErr,
      price_per_unit: priceErr,
      fees: feesErr,
    };
    setErrors(errs);
    if (hasErrors(errs)) return;
    setBusy(true);
    const description = form.description.trim() || null;
    let ok: unknown = false;

    if (form.type === 'transfer') {
      if (transaction && transaction.transfer_group_id) {
        // Keep both legs in step.
        const legs = data.transactions.filter((t) => t.transfer_group_id === transaction.transfer_group_id);
        ok = true;
        for (const leg of legs) {
          ok = (await update('transactions', leg.id, { amount: Number(amount), occurred_on: form.occurred_on, description }, leg === legs[legs.length - 1] ? 'Transfer updated' : undefined)) && ok;
        }
      } else {
        ok = await createTransfer({ fromAccountId: form.account_id, toAccountId: form.to_account_id, amount: amount!, occurredOn: form.occurred_on, description });
      }
    } else {
      const row: Partial<Transaction> = {
        account_id: form.account_id,
        type: form.type,
        amount: Number(amount),
        occurred_on: form.occurred_on,
        description,
        holding_id: canLinkHolding && form.holding_id ? form.holding_id : null,
        units: isTrade && units ? Number(units) : null,
        price_per_unit: isTrade && price ? Number(price) : null,
        fees: isTrade && fees ? Number(fees) : null,
        transfer_group_id: null,
      };
      ok = transaction ? await update('transactions', transaction.id, row, 'Transaction updated') : await insert('transactions', row, 'Transaction recorded');
    }
    setBusy(false);
    if (ok) onOpenChange(false);
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={transaction ? 'Edit transaction' : 'Add transaction'}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Type" htmlFor="tx-type" hint={TYPE_HELP[form.type]}>
            <NativeSelect id="tx-type" value={form.type} onChange={set('type')} disabled={!!transaction && (isTransferLeg || form.type === 'transfer')}>
              {TYPE_OPTIONS.filter((o) => (transaction && !isTransferLeg ? o.value !== 'transfer' : true)).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className={form.type === 'transfer' && !transaction ? 'grid grid-cols-2 gap-3' : ''}>
            <Field label={form.type === 'transfer' ? 'From account' : 'Account'} htmlFor="tx-acc" error={errors.account_id}>
              <NativeSelect id="tx-acc" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value, holding_id: '' })} disabled={isTransferLeg}>
                {accounts.length === 0 ? <option value="">Create an account first</option> : null}
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {form.type === 'transfer' && !transaction ? (
              <Field label="To account" htmlFor="tx-to" error={errors.to_account_id}>
                <NativeSelect id="tx-to" value={form.to_account_id} onChange={set('to_account_id')}>
                  <option value="">Choose…</option>
                  {accounts
                    .filter((a) => a.id !== form.account_id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
            ) : null}
          </div>
          {isTransferLeg ? <Notice>Editing updates both sides of this transfer.</Notice> : null}

          {canLinkHolding && holdings.length > 0 ? (
            <Field label="Investment (optional)" htmlFor="tx-holding" hint={isTrade ? 'Link to update units and cost basis for the holding.' : undefined}>
              <NativeSelect id="tx-holding" value={form.holding_id} onChange={set('holding_id')}>
                <option value="">Not linked</option>
                {holdings.map((h) => (
                  <option key={h.id} value={h.id}>
                    {assetFor(h.asset_id)?.name ?? 'Unknown'}
                    {assetFor(h.asset_id)?.symbol ? ` (${assetFor(h.asset_id)?.symbol})` : ''}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : null}

          {isTrade ? (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Units" htmlFor="tx-units" error={errors.units}>
                <Input id="tx-units" inputMode="decimal" value={form.units} onChange={set('units')} placeholder="0" />
              </Field>
              <Field label={`Price (${selectedAsset?.currency === 'GBX' ? 'pence' : selectedAsset?.currency ?? ccy})`} htmlFor="tx-price" error={errors.price_per_unit}>
                <Input id="tx-price" inputMode="decimal" value={form.price_per_unit} onChange={set('price_per_unit')} placeholder="0.00" />
              </Field>
              <Field label={`Fees (${ccy})`} htmlFor="tx-fees" error={errors.fees}>
                <Input id="tx-fees" inputMode="decimal" value={form.fees} onChange={set('fees')} placeholder="0.00" />
              </Field>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field
              label={isTrade ? `Total ${form.type === 'buy' ? 'cost' : 'proceeds'} (${ccy})` : `Amount (${ccy})`}
              htmlFor="tx-amount"
              error={errors.amount}
              hint={isTrade ? (suggested ? `Excluding fees. Leave blank to use ${suggested}.` : 'Excluding fees.') : undefined}
            >
              <Input id="tx-amount" inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder={suggested ?? '0.00'} aria-invalid={!!errors.amount} />
            </Field>
            <Field label="Date" htmlFor="tx-date" error={errors.occurred_on}>
              <Input id="tx-date" type="date" max={todayISO()} value={form.occurred_on} onChange={set('occurred_on')} />
            </Field>
          </div>
          <Field label="Description" htmlFor="tx-desc">
            <Input id="tx-desc" value={form.description} onChange={set('description')} placeholder="Optional" />
          </Field>
          <FormActions busy={busy} label={transaction ? 'Save' : form.type === 'transfer' ? 'Record transfer' : `Add ${TRANSACTION_TYPE_LABELS[form.type as TransactionType]?.toLowerCase() ?? 'transaction'}`} onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
