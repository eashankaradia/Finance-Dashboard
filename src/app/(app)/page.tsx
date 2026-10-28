'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Landmark, LineChart, Plus, Scale, Sparkles, TrendingUp, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Segmented, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AllocationChart, ValueChart } from '@/components/charts';
import { EmptyState, ErrorState, GainText, Money, Notice, PageSkeleton, PercentText, ReturnValue, StatCard } from '@/components/common';
import { useData } from '@/components/providers/data-provider';
import { SECONDARY_NAV } from '@/components/layout/nav';
import { AccountRow, HoldingCard, TransactionRow } from '@/components/shared/lists';
import { AccountDialog } from '@/components/forms/account-form';
import { allocationByAccount, allocationByAssetClass, allocationByHolding } from '@/lib/finance/allocation';
import { convertOrSame } from '@/lib/finance/fx';
import { periodSummary, seriesForPeriod } from '@/lib/finance/portfolio';
import { PERIODS, PERIOD_LABELS, periodStart, type Period } from '@/lib/dates';
import { formatDate, formatMoney, formatPercent } from '@/lib/format';

export default function DashboardPage() {
  const { status, error, reload, model, data, fx } = useData();
  const [period, setPeriod] = React.useState<Period>('1Y');
  const [newAccount, setNewAccount] = React.useState(false);

  if (status === 'loading') return <PageSkeleton />;
  if (status === 'error') return <ErrorState message={error ?? 'Unknown error'} onRetry={reload} />;

  if (data.accounts.length === 0) {
    return (
      <div className="mx-auto max-w-lg pt-10">
        <EmptyState
          icon={Sparkles}
          title="Welcome! Let's add your first account"
          description="Start with an ISA, pension or savings pot. Record its value whenever you like; add holdings and transactions only if you want more detail."
          action={
            <Button onClick={() => setNewAccount(true)}>
              <Plus /> Add an account
            </Button>
          }
        />
        <AccountDialog open={newAccount} onOpenChange={setNewAccount} />
      </div>
    );
  }

  const from = periodStart(period, model.today);
  const points = seriesForPeriod(model, from);
  const summary = periodSummary(model, from);
  const perf = model.performance;
  const toBase = (v: number, ccy: string) => convertOrSame(v, ccy, 'GBP', fx.rates).toNumber();

  const withReturn = model.positions.filter((p) => p.unrealisedReturn != null && p.units > 0 && !p.account.is_archived);
  const ranked = [...withReturn].sort((a, b) => (b.unrealisedReturn ?? 0) - (a.unrealisedReturn ?? 0));
  const n = Math.min(3, Math.floor(ranked.length / 2));
  const best = ranked.slice(0, n);
  const worst = ranked.slice(ranked.length - n).reverse();
  const recent = [...data.transactions].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at)).slice(0, 6);
  const topHoldings = [...model.positions].filter((p) => !p.account.is_archived && p.units > 0).sort((a, b) => toBase(b.valueForTotals, b.account.currency) - toBase(a.valueForTotals, a.account.currency)).slice(0, 4);
  const discrepancies = model.activeAccounts.filter((m) => m.discrepancy?.significant);

  return (
    <div className="space-y-5">
      {/* Hero */}
      <Card className="overflow-hidden">
        <div className="p-4 pb-0 sm:p-6 sm:pb-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Total portfolio value</p>
              <p className="mt-1 text-4xl font-semibold tracking-tight tabular sm:text-5xl">{formatMoney(model.totalValue)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                {summary ? (
                  <>
                    <GainText value={summary.gain} />
                    <span className="text-muted-foreground">investment gain over {period === 'ALL' ? 'all time' : PERIOD_LABELS[period]}</span>
                    {summary.twr.value != null ? (
                      <span className="text-muted-foreground">
                        · TWR <PercentText value={summary.twr.value} />
                        {summary.twr.reliability === 'estimate' ? ' (est.)' : ''}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-muted-foreground">Record valuations to see performance</span>
                )}
              </div>
            </div>
            <Segmented label="Chart period" value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p, label: PERIOD_LABELS[p] }))} />
          </div>
        </div>
        <div className="px-2 pb-4 pt-4 sm:px-4 sm:pb-5">
          {points.length > 1 ? (
            <ValueChart points={points} />
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">Add at least two valuations to draw your portfolio history.</p>
          )}
        </div>
      </Card>

      {/* Shortcuts to pages that aren't in the bottom tabs */}
      <nav aria-label="More" className="grid grid-cols-3 gap-2 lg:hidden">
        {SECONDARY_NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-center justify-center gap-1.5 rounded-xl border bg-card px-2 py-2.5 text-sm font-medium shadow-sm active:bg-muted">
            <Icon className="size-4 text-brand" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>

      {discrepancies.length > 0 ? (
        <Notice tone="warn">
          {discrepancies.map((m) => (
            <span key={m.account.id} className="block">
              <Link href={`/accounts/${m.account.id}`} className="font-medium underline underline-offset-2">
                {m.account.name}
              </Link>
              : tracked holdings ({formatMoney(m.discrepancy!.calculatedValue, m.account.currency)}) differ from the latest valuation ({formatMoney(m.discrepancy!.snapshotValue, m.account.currency)}) by{' '}
              {formatPercent(m.discrepancy!.pct)}.
            </span>
          ))}
        </Notice>
      ) : null}

      {/* Summary cards */}
      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Total contributions" icon={ArrowDownLeft} value={<Money value={model.contributions} />} sub={model.openingBalances > 0 ? `+ ${formatMoney(model.openingBalances)} opening balances` : 'Money paid in'} />
        <StatCard label="Total withdrawals" icon={ArrowUpRight} value={<Money value={model.withdrawals} />} sub="Money taken out" />
        <StatCard label="Net contributions" icon={Scale} value={<Money value={model.netContributions} />} sub="Contributions − withdrawals" />
        <StatCard
          label="Investment gain/loss"
          icon={TrendingUp}
          value={<GainText value={model.gain} />}
          sub="Excludes deposits & withdrawals"
          hint="Current value + withdrawals − contributions − opening balances"
        />
        <StatCard
          label="Total return"
          icon={LineChart}
          className="col-span-2 lg:col-span-1"
          value={<ReturnValue result={perf.twr} />}
          sub={
            <span>
              Time-weighted{perf.twr.annualised != null ? ` · ${formatPercent(perf.twr.annualised)} p.a.` : ''}
              {perf.xirr.value != null ? ` · XIRR ${formatPercent(perf.xirr.value)} p.a.` : ''}
            </span>
          }
          hint="Time-weighted return removes the effect of when you added or withdrew money. XIRR is your money-weighted annual return."
        />
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Accounts */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>Accounts</CardTitle>
              <CardDescription>Latest values</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/accounts">
                All <ChevronRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y">
              {model.activeAccounts
                .slice()
                .sort((a, b) => b.currentValueBase - a.currentValueBase)
                .map((m) => (
                  <AccountRow key={m.account.id} model={m} />
                ))}
            </div>
          </CardContent>
        </Card>

        {/* Allocation */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Allocation</CardTitle>
              <CardDescription>Share of total value</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="account">
              <TabsList className="w-full">
                <TabsTrigger value="account">Account</TabsTrigger>
                <TabsTrigger value="class">Asset type</TabsTrigger>
                <TabsTrigger value="holding">Holding</TabsTrigger>
              </TabsList>
              <TabsContent value="account">
                <AllocationChart slices={allocationByAccount(model)} />
              </TabsContent>
              <TabsContent value="class">
                <AllocationChart slices={allocationByAssetClass(model)} />
              </TabsContent>
              <TabsContent value="holding">
                <AllocationChart slices={allocationByHolding(model, toBase)} />
                <p className="mt-3 text-xs text-muted-foreground">Tracked holdings only, at market value.</p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Holdings */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Holdings</CardTitle>
              <CardDescription>Largest positions</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/holdings">
                All <ChevronRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {topHoldings.length ? (
              topHoldings.map((p) => (
                <Link key={p.holding.id} href="/holdings" className="block">
                  <HoldingCard p={p} />
                </Link>
              ))
            ) : (
              <EmptyState icon={LineChart} title="No holdings yet" description="Add the shares and funds you own to track their prices." className="py-6" />
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>Contributions, withdrawals and trades</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/activity">
                All <ChevronRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {recent.length ? (
              <ul className="divide-y">
                {recent.map((t) => (
                  <TransactionRow key={t.id} tx={t} />
                ))}
              </ul>
            ) : (
              <EmptyState icon={Wallet} title="No transactions yet" description="Record contributions to measure your returns accurately." className="py-6" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Best and worst */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Best &amp; worst performers</CardTitle>
            <CardDescription>Unrealised return on holdings with a known cost and price</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/insights">
              Insights <ChevronRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {withReturn.length < 2 ? (
            <p className="py-4 text-sm text-muted-foreground">Add at least two holdings with a purchase price and a current price to compare performance.</p>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {[
                { title: 'Best', rows: best },
                { title: 'Worst', rows: worst },
              ].map((g) => (
                <div key={g.title}>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.title}</p>
                  <ul className="space-y-2">
                    {g.rows.map((p) => (
                      <li key={p.holding.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate">
                          <span className="font-medium">{p.asset.symbol ?? p.asset.name}</span>
                          <span className="text-muted-foreground"> · {p.account.name}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <PercentText value={p.unrealisedReturn} className="font-medium" />
                          <span className="ml-2 text-xs">
                            <GainText value={p.unrealisedGain} currency={p.account.currency} />
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Landmark className="size-3.5" />
        Values in GBP. {fx.fallback ? 'Exchange rates are approximate (rate service unavailable).' : fx.asOf ? `Exchange rates from ${fx.source}, ${formatDate(fx.asOf)}.` : ''}{' '}
        <Link href="/settings#methodology" className="underline underline-offset-2">
          How returns are calculated
        </Link>
      </p>
    </div>
  );
}
