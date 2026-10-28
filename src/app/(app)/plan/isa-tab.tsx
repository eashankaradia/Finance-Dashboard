'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Money, Notice, StatCard } from '@/components/common';
import { useData } from '@/components/providers/data-provider';
import { TransactionRow } from '@/components/shared/lists';
import { ISA_ALLOWANCE, LISA_LIMIT, isaAllowance } from '@/lib/finance/isa';
import { formatDate, formatMoney } from '@/lib/format';
import { ACCOUNT_TYPE_LABELS } from '@/lib/types';
import { cn } from '@/lib/utils';

export function Meter({ value, max, label, className }: { value: number; max: number; label: string; className?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const over = value > max;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn('h-2.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div className={cn('h-full rounded-full', over ? 'bg-loss' : 'bg-brand')} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function IsaTab() {
  const { data, model } = useData();
  const isa = isaAllowance(data, model.today);
  const c = isa.current;
  const hasLisa = data.accounts.some((a) => a.account_type === 'lifetime_isa' && !a.is_archived) || c.lisaUsed > 0;

  if (!isa.hasIsa && c.used === 0) {
    return <Notice>Add an ISA account (Stocks &amp; Shares, Cash or Lifetime) and record your contributions to track this year&apos;s allowance.</Notice>;
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3 p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm text-muted-foreground">
                Tax year {c.year.label} · {formatDate(c.year.start)} to {formatDate(c.year.end)}
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight tabular">
                {formatMoney(c.used)} <span className="text-base font-normal text-muted-foreground">of {formatMoney(ISA_ALLOWANCE, 'GBP', { compact: true })} used</span>
              </p>
            </div>
            <p className="text-sm text-muted-foreground">{Math.round((c.used / ISA_ALLOWANCE) * 100)}%</p>
          </div>
          <Meter value={c.used} max={ISA_ALLOWANCE} label="ISA allowance used" />
          {c.over > 0 ? (
            <Notice tone="warn">You&apos;ve recorded {formatMoney(c.over)} more than the £20,000 allowance. Check whether some of it was an ISA transfer rather than new money.</Notice>
          ) : null}
        </CardContent>
      </Card>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Allowance summary">
        <StatCard label="Left to use" value={<Money value={c.remaining} />} sub={`Until ${formatDate(c.year.end, 'short')}`} />
        <StatCard
          label="To use it all"
          value={c.remaining > 0 ? <Money value={isa.monthlyToMax} /> : '—'}
          sub={c.remaining > 0 ? `a month for ${isa.monthsLeft} month${isa.monthsLeft === 1 ? '' : 's'}` : 'Allowance used'}
        />
        {hasLisa ? (
          <StatCard
            label="Lifetime ISA"
            value={<Money value={c.lisaUsed} />}
            sub={<span className={c.lisaOver > 0 ? 'text-loss' : undefined}>of {formatMoney(LISA_LIMIT, 'GBP', { compact: true })} · counts in the £20k</span>}
          />
        ) : null}
        <StatCard label="Days left" value={isa.daysLeft} sub="Unused allowance doesn't carry over" className={hasLisa ? undefined : 'col-span-2 lg:col-span-2'} />
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>By account</CardTitle>
              <CardDescription>Paid in this tax year</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {c.byAccount.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No ISA contributions recorded since {formatDate(c.year.start)}.</p>
            ) : (
              c.byAccount.map((r) => (
                <div key={r.account.id}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{r.account.name}</span>
                      <span className="text-muted-foreground"> · {ACCOUNT_TYPE_LABELS[r.account.account_type]}</span>
                    </span>
                    <Money value={r.amount} className="font-medium" />
                  </div>
                  <Meter
                    value={r.amount}
                    max={r.account.account_type === 'lifetime_isa' ? LISA_LIMIT : ISA_ALLOWANCE}
                    label={`${r.account.name} share of allowance`}
                    className="h-1.5"
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Previous years</CardTitle>
              <CardDescription>Allowance used per tax year</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {isa.history.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No contributions recorded in earlier tax years.</p>
            ) : (
              <div className="divide-y">
                {isa.history.map((y) => (
                  <div key={y.year.label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="font-medium">{y.year.label}</span>
                    <span className="text-right">
                      <Money value={y.used} className="font-medium" />
                      <span className="ml-2 text-xs text-muted-foreground">{Math.round((y.used / ISA_ALLOWANCE) * 100)}% used</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {c.subscriptions.length ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Contributions this tax year</CardTitle>
              <CardDescription>What counts towards the allowance</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y">
              {c.subscriptions.map((s) => (
                <TransactionRow key={s.tx.id} tx={s.tx} />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Counts contributions into ISAs, and transfers into an ISA from your non-ISA accounts. Transfers between ISAs don&apos;t use allowance, and withdrawals don&apos;t give it back here (some flexible ISAs allow that). The Lifetime ISA bonus isn&apos;t a contribution, so record it as interest or an adjustment.
      </p>
    </div>
  );
}
