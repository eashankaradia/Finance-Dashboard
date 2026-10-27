'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, ArrowLeft, Camera, Eye, EyeOff, LineChart, MoreHorizontal, Pencil, Plus, Save, Trash2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Segmented } from '@/components/ui/tabs';
import { ValueChart } from '@/components/charts';
import { EmptyState, ErrorState, GainText, Money, Notice, PageSkeleton, ReturnValue, StatCard, ValueSourceBadge } from '@/components/common';
import { useData } from '@/components/providers/data-provider';
import { HoldingCard, TransactionRow } from '@/components/shared/lists';
import { AccountDialog } from '@/components/forms/account-form';
import { SnapshotDialog } from '@/components/forms/snapshot-form';
import { TransactionDialog } from '@/components/forms/transaction-form';
import { HoldingDialog } from '@/components/forms/holding-form';
import { accountSeries } from '@/lib/finance/portfolio';
import { PERIODS, PERIOD_LABELS, periodStart, type Period } from '@/lib/dates';
import { formatDate, formatMoney, formatPercent } from '@/lib/format';
import { ACCOUNT_TYPE_LABELS, type Holding, type Snapshot } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function AccountPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { status, error, reload, model, data, update, remove } = useData();
  const [period, setPeriod] = React.useState<Period>('ALL');
  const [dialog, setDialog] = React.useState<null | 'edit' | 'snapshot' | 'tx' | 'holding' | 'delete' | 'archive'>(null);
  const [editingSnapshot, setEditingSnapshot] = React.useState<Snapshot | undefined>();
  const [deletingSnapshot, setDeletingSnapshot] = React.useState<Snapshot | undefined>();
  const [editingHolding, setEditingHolding] = React.useState<Holding | undefined>();
  const [showRef, setShowRef] = React.useState(false);
  const [txLimit, setTxLimit] = React.useState(10);

  if (status === 'loading') return <PageSkeleton />;
  if (status === 'error') return <ErrorState message={error ?? ''} onRetry={reload} />;

  const m = model.accounts.find((x) => x.account.id === id);
  if (!m) {
    return (
      <EmptyState
        icon={Wallet}
        title="Account not found"
        description="It may have been deleted."
        action={
          <Button asChild variant="outline">
            <Link href="/accounts">Back to accounts</Link>
          </Button>
        }
      />
    );
  }

  const a = m.account;
  const ccy = a.currency;
  const perf = m.performance;
  const allPoints = accountSeries(m, model.today);
  const from = periodStart(period, model.today);
  const points = from ? allPoints.filter((p) => p.date >= from) : allPoints;
  const txs = data.transactions.filter((t) => t.account_id === a.id).sort((x, y) => y.occurred_on.localeCompare(x.occurred_on) || y.created_at.localeCompare(x.created_at));
  const snapshotsDesc = [...m.snapshots].reverse();
  const close = (o: boolean) => !o && setDialog(null);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/accounts" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Accounts
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{a.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span>{[a.provider, ACCOUNT_TYPE_LABELS[a.account_type], a.currency].filter(Boolean).join(' · ')}</span>
              {a.reference ? (
                <button onClick={() => setShowRef((s) => !s)} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs tabular" aria-label={showRef ? 'Hide reference' : 'Show reference'}>
                  {showRef ? a.reference : `••••${a.reference.slice(-4)}`}
                  {showRef ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                </button>
              ) : null}
              {a.opened_on ? <span>Opened {formatDate(a.opened_on)}</span> : null}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" aria-label="Record value" onClick={() => { setEditingSnapshot(undefined); setDialog('snapshot'); }}>
              <Camera /> <span className="hidden sm:inline">Record value</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Account actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setDialog('edit')}>
                  <Pencil /> Edit details
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDialog('tx')}>
                  <Plus /> Add transaction
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { setEditingHolding(undefined); setDialog('holding'); }}>
                  <LineChart /> Add holding
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setDialog('archive')}>
                  {a.is_archived ? <ArchiveRestore /> : <Archive />} {a.is_archived ? 'Unarchive' : 'Archive'}
                </DropdownMenuItem>
                <DropdownMenuItem destructive onSelect={() => setDialog('delete')}>
                  <Trash2 /> Delete account
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 p-4 pb-0 sm:p-6 sm:pb-0">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground">Current value</p>
              <ValueSourceBadge source={m.valueSource} />
            </div>
            <Money value={m.currentValue} currency={ccy} className="mt-1 block text-4xl font-semibold tracking-tight" />
            <p className="mt-1 text-xs text-muted-foreground">
              {m.valueSource === 'calculated'
                ? `${formatMoney(m.holdingsValue, ccy)} holdings + ${formatMoney(a.cash_balance, ccy)} cash, at latest prices`
                : m.valueSource === 'snapshot'
                  ? `Recorded ${formatDate(m.valueDate)}${perf.flowsAfterLastValuation ? `, ${formatMoney(perf.flowsAfterLastValuation, ccy, { sign: true })} from later contributions/withdrawals` : ''}`
                  : 'No valuation recorded yet'}
              {m.currentValueBase !== m.currentValue && !m.fxMissing ? ` · ≈ ${formatMoney(m.currentValueBase)}` : ''}
            </p>
            {m.valueSource === 'calculated' ? (
              <Button
                variant="link"
                size="sm"
                className="h-auto px-0 text-xs"
                onClick={() => {
                  setEditingSnapshot(undefined);
                  setDialog('snapshot');
                }}
              >
                <Save className="size-3" /> Save today&apos;s value as a snapshot for history
              </Button>
            ) : null}
          </div>
          <Segmented label="Chart period" value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p, label: PERIOD_LABELS[p] }))} />
        </div>
        <div className="px-2 pb-4 pt-4 sm:px-4">
          {points.length > 1 ? <ValueChart points={points} height={220} /> : <p className="py-12 text-center text-sm text-muted-foreground">Record two or more valuations to see this account&apos;s history.</p>}
        </div>
      </Card>

      {m.discrepancy ? (
        <Notice tone={m.discrepancy.significant ? 'warn' : 'info'}>
          {a.valuation_mode === 'snapshot'
            ? `Tracked holdings${a.cash_balance ? ' and cash' : ''} add up to ${formatMoney(m.discrepancy.calculatedValue, ccy)}, versus your valuation of ${formatMoney(m.discrepancy.snapshotValue, ccy)} on ${formatDate(m.discrepancy.snapshotDate)} (${formatPercent(m.discrepancy.pct)}). The valuation is what counts in your totals.`
            : `Today's calculated value is ${formatMoney(m.discrepancy.calculatedValue, ccy)}; your latest snapshot was ${formatMoney(m.discrepancy.snapshotValue, ccy)} on ${formatDate(m.discrepancy.snapshotDate)} (${formatPercent(m.discrepancy.pct)}).`}
          {m.discrepancy.significant ? ' Check for missing holdings, cash or an out-of-date valuation.' : ''}
        </Notice>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Performance">
        <StatCard label="Contributions" value={<Money value={perf.contributions} currency={ccy} />} sub={perf.startValue > 0 ? `+ ${formatMoney(perf.startValue, ccy)} opening value` : 'Includes transfers in'} />
        <StatCard label="Withdrawals" value={<Money value={perf.withdrawals} currency={ccy} />} sub="Includes transfers out" />
        <StatCard label="Investment gain/loss" value={<GainText value={perf.gain} currency={ccy} />} sub={`Net contributions ${formatMoney(perf.netContributions, ccy)}`} />
        <StatCard
          label="Return"
          value={<ReturnValue result={perf.twr} />}
          sub={
            <>
              Time-weighted{perf.twr.annualised != null ? ` · ${formatPercent(perf.twr.annualised)} p.a.` : ''}
              {perf.xirr.value != null ? ` · XIRR ${formatPercent(perf.xirr.value)}${perf.xirr.reliability === 'estimate' ? ' (est.)' : ''}` : ''}
            </>
          }
        />
      </section>
      {perf.assumptions.length ? (
        <Notice>
          <ul className="space-y-0.5">
            {perf.assumptions.map((x) => (
              <li key={x}>{x}</li>
            ))}
            {perf.startDate ? <li>Measured from {formatDate(perf.startDate)}.</li> : null}
          </ul>
        </Notice>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Valuation history</CardTitle>
              <CardDescription>Every snapshot is kept unless you edit or delete it</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setEditingSnapshot(undefined); setDialog('snapshot'); }}>
              <Plus /> Add
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {snapshotsDesc.length ? (
              <div className="max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-2 font-medium">Date</th>
                      <th className="py-2 text-right font-medium">Value</th>
                      <th className="py-2 text-right font-medium">Change</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {snapshotsDesc.map((s, i) => {
                      const prev = snapshotsDesc[i + 1];
                      return (
                        <tr key={s.id} className="border-t">
                          <td className="py-2">
                            {formatDate(s.valued_on)}
                            {s.notes ? <p className="max-w-[160px] truncate text-xs text-muted-foreground">{s.notes}</p> : null}
                          </td>
                          <td className="py-2 text-right font-medium tabular">{formatMoney(s.value, ccy)}</td>
                          <td className={cn('py-2 text-right text-xs tabular', prev ? (s.value >= prev.value ? 'text-gain' : 'text-loss') : 'text-muted-foreground')}>
                            {prev ? formatMoney(s.value - prev.value, ccy, { sign: true }) : 'First'}
                          </td>
                          <td className="py-1 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-label="Snapshot actions">
                                  <MoreHorizontal />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <DropdownMenuItem onSelect={() => { setEditingSnapshot(s); setDialog('snapshot'); }}>
                                  <Pencil /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem destructive onSelect={() => setDeletingSnapshot(s)}>
                                  <Trash2 /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={Camera} title="No valuations yet" description="Record what the account is worth today. Add one whenever you check it." className="py-6" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Holdings</CardTitle>
              <CardDescription>{a.valuation_mode === 'holdings' ? 'These make up the account value' : 'For information; the valuation is used for totals'}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setEditingHolding(undefined); setDialog('holding'); }}>
              <Plus /> Add
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {m.positions.length ? (
              m.positions.map((p) => <HoldingCard key={p.holding.id} p={p} onClick={() => { setEditingHolding(p.holding); setDialog('holding'); }} />)
            ) : (
              <EmptyState icon={LineChart} title="No holdings" description="Optional: add shares and funds to track prices and gains individually." className="py-6" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Transactions</CardTitle>
            <CardDescription>{txs.length} recorded</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setDialog('tx')}>
            <Plus /> Add
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          {txs.length ? (
            <>
              <ul className="divide-y">
                {txs.slice(0, txLimit).map((t) => (
                  <TransactionRow key={t.id} tx={t} showAccount={false} />
                ))}
              </ul>
              {txs.length > txLimit ? (
                <Button variant="ghost" className="mt-2 w-full" onClick={() => setTxLimit((l) => l + 20)}>
                  Show more
                </Button>
              ) : null}
            </>
          ) : (
            <EmptyState icon={Wallet} title="No transactions" description="Record contributions and withdrawals so returns exclude the money you paid in." className="py-6" />
          )}
        </CardContent>
      </Card>

      {a.notes ? (
        <Card className="p-4 text-sm">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Notes</p>
          <p className="whitespace-pre-wrap">{a.notes}</p>
        </Card>
      ) : null}

      <AccountDialog open={dialog === 'edit'} onOpenChange={close} account={a} />
      <SnapshotDialog
        open={dialog === 'snapshot'}
        onOpenChange={close}
        accountId={a.id}
        snapshot={editingSnapshot}
        suggestedValue={m.valueSource === 'calculated' && m.calculatedValue != null ? m.calculatedValue : undefined}
      />
      <TransactionDialog open={dialog === 'tx'} onOpenChange={close} accountId={a.id} />
      <HoldingDialog open={dialog === 'holding'} onOpenChange={close} accountId={a.id} holding={editingHolding} />
      <ConfirmDialog
        open={!!deletingSnapshot}
        onOpenChange={(o) => !o && setDeletingSnapshot(undefined)}
        title="Delete this valuation?"
        description={deletingSnapshot ? `${formatMoney(deletingSnapshot.value, ccy)} on ${formatDate(deletingSnapshot.valued_on)} will be permanently removed from the history.` : ''}
        onConfirm={async () => {
          if (deletingSnapshot) await remove('snapshots', deletingSnapshot.id, 'Valuation deleted');
        }}
      />
      <ConfirmDialog
        open={dialog === 'archive'}
        onOpenChange={close}
        destructive={false}
        title={a.is_archived ? 'Unarchive account?' : 'Archive account?'}
        confirmLabel={a.is_archived ? 'Unarchive' : 'Archive'}
        description={
          a.is_archived
            ? 'It will appear in your account lists again.'
            : 'It will be hidden from lists but its history still counts in your totals and charts. If you closed it, record a final £0 valuation and how the money left (transfer or withdrawal) first.'
        }
        onConfirm={async () => {
          await update('accounts', a.id, { is_archived: !a.is_archived }, a.is_archived ? 'Account restored' : 'Account archived');
        }}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={close}
        title={`Delete ${a.name}?`}
        description={`This permanently deletes the account with its ${m.snapshots.length} valuations, ${txs.length} transactions and ${m.positions.length} holdings. Consider archiving instead. This can't be undone.`}
        confirmLabel="Delete permanently"
        onConfirm={async () => {
          if (await remove('accounts', a.id, 'Account deleted')) router.push('/accounts');
        }}
      />
    </div>
  );
}
