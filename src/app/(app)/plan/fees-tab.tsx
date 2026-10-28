'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Money, Notice, StatCard } from '@/components/common';
import { useData } from '@/components/providers/data-provider';
import { feesSummary, type ChargeLine } from '@/lib/finance/fees';
import { formatDate, formatMoney, formatPercent } from '@/lib/format';

function ChargeRows({ rows }: { rows: ChargeLine[] }) {
  return (
    <div className="divide-y">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{r.label}</p>
            <p className="truncate text-xs text-muted-foreground">
              {r.pct}% a year on {formatMoney(r.value)}
              {r.sub ? ` · ${r.sub}` : ''}
            </p>
          </div>
          <Money value={r.yearly} className="shrink-0 text-sm font-medium" />
        </div>
      ))}
    </div>
  );
}

export function FeesTab() {
  const { data, model, fx } = useData();
  const f = feesSummary(model, data, fx.rates, model.today);
  const hasCharges = f.fundCharges.length + f.platformCharges.length > 0;

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Fees summary">
        <StatCard
          label="Estimated yearly charges"
          value={hasCharges ? <Money value={f.estimatedYearly} /> : '—'}
          sub={f.estimatedPct != null ? `${formatPercent(f.estimatedPct, { sign: false })} of your portfolio` : 'Add fee rates below'}
          hint="Fund ongoing charges and platform fees on today's values. Taken from the fund's value, so they don't appear as transactions."
        />
        <StatCard label="Over 10 years" value={hasCharges ? <Money value={f.estimatedYearly * 10} /> : '—'} sub="At today's values, before growth" />
        <StatCard label={`Recorded fees ${f.thisYearLabel}`} value={<Money value={f.thisYear} />} sub="This tax year" />
        <StatCard label="Recorded fees, all time" value={<Money value={f.total} />} sub={`${f.items.length} fee${f.items.length === 1 ? '' : 's'} recorded`} />
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Fund charges</CardTitle>
              <CardDescription>Ongoing charge (OCF) × current value</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {f.fundCharges.length ? <ChargeRows rows={f.fundCharges} /> : <p className="py-2 text-sm text-muted-foreground">No ongoing charges entered yet.</p>}
            {f.missingOcf.length ? (
              <Notice>
                No ongoing charge for {f.missingOcf.map((p) => p.asset.name).join(', ')}. Add it from the fund&apos;s factsheet: open the holding on{' '}
                <Link href="/holdings" className="underline underline-offset-2">
                  Holdings
                </Link>{' '}
                and choose Edit.
              </Notice>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Platform fees</CardTitle>
              <CardDescription>Account fee × current account value</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {f.platformCharges.length ? <ChargeRows rows={f.platformCharges} /> : <p className="py-2 text-sm text-muted-foreground">No platform fees entered yet.</p>}
            {f.missingPlatform.length ? (
              <Notice>
                No platform fee for {f.missingPlatform.map((a) => a.name).join(', ')}. Add it by editing the account on{' '}
                <Link href="/accounts" className="underline underline-offset-2">
                  Accounts
                </Link>
                . Enter 0 if there isn&apos;t one.
              </Notice>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recorded fees by account</CardTitle>
              <CardDescription>Fee transactions and dealing charges</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {f.byAccount.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No fees recorded. Add a Fee transaction, or a dealing fee on a buy or sell.</p>
            ) : (
              <div className="divide-y">
                {f.byAccount.map((r) => (
                  <div key={r.account.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0 truncate font-medium">{r.account.name}</span>
                    <span className="shrink-0 text-right">
                      <Money value={r.total} className="font-medium" />
                      <span className="ml-2 text-xs text-muted-foreground">{formatMoney(r.thisYear)} this year</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recorded fees by tax year</CardTitle>
              <CardDescription>6 April to 5 April</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {f.byYear.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">Nothing recorded yet.</p>
            ) : (
              <div className="divide-y">
                {f.byYear.map((y) => (
                  <div key={y.label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="font-medium">{y.label}</span>
                    <Money value={y.total} className="font-medium" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {f.items.length ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent fees</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y">
              {f.items.slice(0, 20).map((i) => (
                <div key={`${i.tx.id}-${i.kind}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{i.kind === 'dealing' ? 'Dealing fee' : i.tx.description || 'Fee'}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {i.account.name} · {formatDate(i.tx.occurred_on)}
                    </p>
                  </div>
                  <Money value={i.amount} className="shrink-0 font-medium" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Estimates use today&apos;s values. Providers charge on daily or monthly averages and some cap or tier their fees, so check your statements for exact amounts.
      </p>
    </div>
  );
}
