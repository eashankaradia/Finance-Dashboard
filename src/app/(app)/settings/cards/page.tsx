'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, CreditCard, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Input, Textarea, NativeSelect } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { EmptyState, ErrorState, Money, PageSkeleton, StatCard } from '@/components/common';
import { FormActions, hasErrors, optionalAmount, requireAmount, requireDate, type Errors } from '@/components/forms/shared';
import { useData } from '@/components/providers/data-provider';
import { addDays, daysBetween, todayISO } from '@/lib/dates';
import { formatDate, formatMoney } from '@/lib/format';
import { D, sum } from '@/lib/money';
import type { CreditCard as Card_, CreditCardBill } from '@/lib/types';

function billState(b: CreditCardBill, today: string): { label: string; variant: 'gain' | 'loss' | 'warn' | 'outline' } {
  if (b.status === 'paid') return { label: 'Paid', variant: 'gain' };
  const days = daysBetween(today, b.due_date);
  if (days < 0) return { label: `${-days}d overdue`, variant: 'loss' };
  if (days <= 14) return { label: `Due in ${days}d`, variant: 'warn' };
  return { label: 'Unpaid', variant: 'outline' };
}

export default function CardsPage() {
  const { status, error, reload, data, update, remove } = useData();
  const [cardDialog, setCardDialog] = React.useState<{ open: boolean; card?: Card_ }>({ open: false });
  const [billDialog, setBillDialog] = React.useState<{ open: boolean; bill?: CreditCardBill; cardId?: string }>({ open: false });
  const [deleting, setDeleting] = React.useState<{ kind: 'card' | 'bill'; id: string; label: string } | null>(null);
  const today = todayISO();

  if (status === 'loading') return <PageSkeleton />;
  if (status === 'error') return <ErrorState message={error ?? ''} onRetry={reload} />;

  const outstanding = (bills: CreditCardBill[]) => sum(bills.filter((b) => b.status !== 'paid').map((b) => D(b.amount_due).minus(D(b.amount_paid)))).toNumber();
  const total = outstanding(data.bills);
  const nextDue = data.bills.filter((b) => b.status !== 'paid').sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

  return (
    <div className="space-y-5">
      <div>
        <Link href="/settings" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Settings
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Credit cards</h1>
            <p className="mt-1 text-sm text-muted-foreground">Statements and due dates. Not included in your investment totals.</p>
          </div>
          <Button onClick={() => setCardDialog({ open: true })}>
            <Plus /> Add card
          </Button>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3" aria-label="Summary">
        <StatCard label="Outstanding" value={<Money value={total} />} />
        <StatCard label="Next due" value={nextDue ? formatDate(nextDue.due_date) : '—'} sub={nextDue ? formatMoney(nextDue.amount_due - nextDue.amount_paid) : 'Nothing due'} />
      </section>

      {data.cards.length === 0 ? (
        <EmptyState icon={CreditCard} title="No cards" description="Add a credit card to track its statements." />
      ) : (
        data.cards.map((card) => {
          const bills = data.bills.filter((b) => b.card_id === card.id).sort((a, b) => b.due_date.localeCompare(a.due_date));
          const owed = outstanding(bills);
          return (
            <Card key={card.id}>
              <CardHeader>
                <div>
                  <CardTitle>{card.name}</CardTitle>
                  <CardDescription>
                    {formatMoney(owed)} outstanding{card.credit_limit ? ` · limit ${formatMoney(card.credit_limit)}` : ''}
                  </CardDescription>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setBillDialog({ open: true, cardId: card.id })}>
                    <Plus /> Statement
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Card actions">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => setCardDialog({ open: true, card })}>
                        <Pencil /> Edit card
                      </DropdownMenuItem>
                      <DropdownMenuItem destructive onSelect={() => setDeleting({ kind: 'card', id: card.id, label: card.name })}>
                        <Trash2 /> Delete card
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {bills.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">No statements yet.</p>
                ) : (
                  <ul className="divide-y">
                    {bills.map((b) => {
                      const st = billState(b, today);
                      return (
                        <li key={b.id} className="flex items-center gap-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-2 text-sm font-medium tabular">
                              {formatMoney(b.amount_due)} <Badge variant={st.variant}>{st.label}</Badge>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Statement {formatDate(b.statement_date, 'short')} · due {formatDate(b.due_date)}
                              {b.status !== 'paid' && b.amount_paid > 0 ? ` · ${formatMoney(b.amount_paid)} paid` : ''}
                            </p>
                          </div>
                          {b.status !== 'paid' ? (
                            <Button variant="outline" size="sm" onClick={() => update('bills', b.id, { status: 'paid', amount_paid: b.amount_due }, 'Marked as paid')}>
                              <CheckCircle2 /> Paid
                            </Button>
                          ) : null}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label="Statement actions">
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onSelect={() => setBillDialog({ open: true, bill: b, cardId: card.id })}>
                                <Pencil /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem destructive onSelect={() => setDeleting({ kind: 'bill', id: b.id, label: `${formatMoney(b.amount_due)} statement` })}>
                                <Trash2 /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      <CardDialog state={cardDialog} onClose={() => setCardDialog({ open: false })} />
      <BillDialog state={billDialog} onClose={() => setBillDialog({ open: false })} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.label}?`}
        description={deleting?.kind === 'card' ? 'The card and all its statements will be permanently deleted.' : 'This statement will be permanently deleted.'}
        onConfirm={async () => {
          if (deleting) await remove(deleting.kind === 'card' ? 'cards' : 'bills', deleting.id, 'Deleted');
        }}
      />
    </div>
  );
}

function CardDialog({ state, onClose }: { state: { open: boolean; card?: Card_ }; onClose: () => void }) {
  const { insert, update } = useData();
  const [name, setName] = React.useState('');
  const [limit, setLimit] = React.useState('');
  const [errors, setErrors] = React.useState<Errors>({});
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (state.open) {
      setName(state.card?.name ?? '');
      setLimit(state.card?.credit_limit != null ? String(state.card.credit_limit) : '');
      setErrors({});
    }
  }, [state]);
  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={state.card ? 'Edit card' : 'Add card'}>
        <form
          noValidate
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const [l, lErr] = optionalAmount(limit, 'Limit');
            const errs = { name: name.trim() ? null : 'Enter a name', limit: lErr };
            setErrors(errs);
            if (hasErrors(errs)) return;
            setBusy(true);
            const row = { name: name.trim(), credit_limit: l != null ? Number(l) : null };
            const ok = state.card ? await update('cards', state.card.id, row, 'Card updated') : await insert('cards', row, 'Card added');
            setBusy(false);
            if (ok) onClose();
          }}
        >
          <Field label="Card name" htmlFor="c-name" error={errors.name}>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Credit limit (optional)" htmlFor="c-limit" error={errors.limit}>
            <Input id="c-limit" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} />
          </Field>
          <FormActions busy={busy} label="Save" onCancel={onClose} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BillDialog({ state, onClose }: { state: { open: boolean; bill?: CreditCardBill; cardId?: string }; onClose: () => void }) {
  const { insert, update } = useData();
  const blank = () => ({ statement_date: todayISO(), due_date: addDays(todayISO(), 25), amount_due: '', amount_paid: '', minimum_payment: '', status: 'unpaid', notes: '' });
  const [f, setF] = React.useState(blank);
  const [errors, setErrors] = React.useState<Errors>({});
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!state.open) return;
    setErrors({});
    const b = state.bill;
    setF(
      b
        ? { statement_date: b.statement_date, due_date: b.due_date, amount_due: String(b.amount_due), amount_paid: String(b.amount_paid), minimum_payment: b.minimum_payment != null ? String(b.minimum_payment) : '', status: b.status, notes: b.notes ?? '' }
        : blank(),
    );
  }, [state]);
  const set = (k: keyof ReturnType<typeof blank>) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={state.bill ? 'Edit statement' : 'Add statement'}>
        <form
          noValidate
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const [due, dueErr] = requireAmount(f.amount_due, { allowZero: true, label: 'Amount due' });
            const [paid, paidErr] = optionalAmount(f.amount_paid, 'Amount paid');
            const [min, minErr] = optionalAmount(f.minimum_payment, 'Minimum payment');
            const errs = { statement_date: requireDate(f.statement_date), due_date: requireDate(f.due_date, { allowFuture: true }), amount_due: dueErr, amount_paid: paidErr, minimum_payment: minErr };
            setErrors(errs);
            if (hasErrors(errs)) return;
            setBusy(true);
            const row = {
              card_id: state.cardId!,
              statement_date: f.statement_date,
              due_date: f.due_date,
              amount_due: Number(due),
              amount_paid: paid ? Number(paid) : 0,
              minimum_payment: min ? Number(min) : null,
              status: f.status as CreditCardBill['status'],
              notes: f.notes.trim() || null,
            };
            const ok = state.bill ? await update('bills', state.bill.id, row, 'Statement updated') : await insert('bills', row, 'Statement added');
            setBusy(false);
            if (ok) onClose();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Statement date" htmlFor="b-st" error={errors.statement_date}>
              <Input id="b-st" type="date" value={f.statement_date} onChange={set('statement_date')} />
            </Field>
            <Field label="Due date" htmlFor="b-due" error={errors.due_date}>
              <Input id="b-due" type="date" value={f.due_date} onChange={set('due_date')} />
            </Field>
            <Field label="Amount due" htmlFor="b-amt" error={errors.amount_due}>
              <Input id="b-amt" inputMode="decimal" value={f.amount_due} onChange={set('amount_due')} />
            </Field>
            <Field label="Minimum payment" htmlFor="b-min" error={errors.minimum_payment}>
              <Input id="b-min" inputMode="decimal" value={f.minimum_payment} onChange={set('minimum_payment')} placeholder="Optional" />
            </Field>
            <Field label="Amount paid" htmlFor="b-paid" error={errors.amount_paid}>
              <Input id="b-paid" inputMode="decimal" value={f.amount_paid} onChange={set('amount_paid')} placeholder="0.00" />
            </Field>
            <Field label="Status" htmlFor="b-status">
              <NativeSelect id="b-status" value={f.status} onChange={set('status')}>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </NativeSelect>
            </Field>
          </div>
          <Field label="Notes" htmlFor="b-notes">
            <Textarea id="b-notes" rows={2} value={f.notes} onChange={set('notes')} />
          </Field>
          <FormActions busy={busy} label="Save" onCancel={onClose} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
