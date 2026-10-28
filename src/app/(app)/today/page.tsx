'use client';

import * as React from 'react';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, GainText, Money, PageHeader, PageSkeleton, PercentText, StatCard } from '@/components/common';
import { useData } from '@/components/providers/data-provider';
import { TransactionRow } from '@/components/shared/lists';
import { dailySummary } from '@/lib/finance/daily-summary';
import { formatDate, formatMoney, formatPercent } from '@/lib/format';

export default function TodayPage() {
  const { status, error, reload, model, data, price, fx } = useData();
  if (status === 'loading') return <PageSkeleton />;
  if (status === 'error') return <ErrorState message={error ?? ''} onRetry={reload} />;

  const s = dailySummary(model, data, price.prices, fx.rates);
  const accountName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? 'Account';

  return (
    <div className="space-y-5">
      <PageHeader title="Today" description={formatDate(s.today, 'long')} />

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Portfolio value" icon={CalendarDays} value={<Money value={s.totalValue} />} sub="All accounts" />
        <StatCard
          label="Holdings today"
          value={s.holdingsChange != null ? <GainText value={s.holdingsChange} /> : '—'}
          sub={
            s.holdingsChange != null ? (
              <span>
                <PercentText value={s.holdingsChangePct} />
                {s.pricesAsOf ? ` · prices ${formatDate(s.pricesAsOf, 'short')}` : ''}
              </span>
            ) : (
              'No market-priced holdings'
            )
          }
          hint="Change since the previous closing price for holdings priced automatically. UK funds publish one price a day, usually a day behind."
        />
        <StatCard
          label="Past 7 days"
          value={s.week ? <GainText value={s.week.gain} /> : '—'}
          sub={s.week?.twr != null ? `${formatPercent(s.week.twr, { sign: true })} return` : 'Not enough history'}
          hint="Investment gain, excluding money paid in or taken out."
        />
        <StatCard
          label="Past 30 days"
          value={s.month ? <GainText value={s.month.gain} /> : '—'}
          sub={s.month?.twr != null ? `${formatPercent(s.month.twr, { sign: true })} return` : 'Not enough history'}
          hint="Investment gain, excluding money paid in or taken out."
        />
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Today&apos;s moves</CardTitle>
            <CardDescription>Biggest first, in GBP</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {s.movers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No holdings with a market price yet.</p>
          ) : (
            <div className="divide-y">
              {s.movers.map((m) => (
                <div key={m.position.holding.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.position.asset.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.position.account.name} · {formatMoney(m.value)}
                      {m.priceDate ? ` · ${formatDate(m.priceDate, 'short')}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-sm">
                    <GainText value={m.change} />
                    <p className="text-xs">
                      <PercentText value={m.changePct} />
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {s.unmoved.length ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Not shown: {s.unmoved.map((p) => p.asset.symbol ?? p.asset.name).join(', ')} (manual price or no daily change available).
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recorded today</CardTitle>
            <CardDescription>Transactions and valuations dated today</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {s.transactions.length === 0 && s.snapshots.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing recorded today. <Link href="/activity" className="underline underline-offset-2">See all activity</Link>
            </p>
          ) : (
            <div className="divide-y">
              {s.snapshots.map((sn) => (
                <div key={sn.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate">Valuation · {accountName(sn.account_id)}</span>
                  <Money value={sn.value} className="font-medium" />
                </div>
              ))}
              {s.transactions.map((t) => (
                <TransactionRow key={t.id} tx={t} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
