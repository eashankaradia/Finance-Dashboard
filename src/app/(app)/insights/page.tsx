'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Segmented } from '@/components/ui/tabs';
import { AllocationChart, ComparisonChart, FlowsChart, GainChart, ValueChart } from '@/components/charts';
import { ErrorState, GainText, Money, PageHeader, PageSkeleton, ReturnValue, StatCard } from '@/components/common';
import { useData } from '@/components/providers/data-provider';
import { allocationByAccount, allocationByAssetClass, allocationByHolding } from '@/lib/finance/allocation';
import { groupFlows } from '@/lib/finance/flows';
import { convertOrSame } from '@/lib/finance/fx';
import { periodSummary, seriesForPeriod } from '@/lib/finance/portfolio';
import { PERIODS, PERIOD_LABELS, periodStart, type Period } from '@/lib/dates';
import { formatMoney, formatPercent } from '@/lib/format';

export default function InsightsPage() {
  const { status, error, reload, model, fx } = useData();
  const [period, setPeriod] = React.useState<Period>('ALL');

  if (status === 'loading') return <PageSkeleton />;
  if (status === 'error') return <ErrorState message={error ?? ''} onRetry={reload} />;

  const from = periodStart(period, model.today);
  const points = seriesForPeriod(model, from);
  const summary = periodSummary(model, from);
  const monthly = groupFlows(model.externalFlows.filter((f) => !from || f.date > from), 'month');
  const toBase = (v: number, ccy: string) => convertOrSame(v, ccy, 'GBP', fx.rates).toNumber();
  const accounts = model.activeAccounts.slice().sort((a, b) => b.currentValueBase - a.currentValueBase);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Insights"
        description="Performance, cash flows and allocation"
        actions={<Segmented label="Period" value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p, label: PERIOD_LABELS[p] }))} />}
      />

      {summary ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Period summary">
          <StatCard label="Start value" value={<Money value={summary.startValue} />} />
          <StatCard label="End value" value={<Money value={summary.endValue} />} />
          <StatCard label="Net money in" value={<Money value={summary.netFlows} sign />} sub="Contributions − withdrawals (+ opening balances)" />
          <StatCard label="Investment gain" value={<GainText value={summary.gain} />} sub={<span>TWR <ReturnValue result={summary.twr} /></span>} />
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Portfolio value</CardTitle>
              <CardDescription>Value against money invested. Hollow points include estimated values.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>{points.length > 1 ? <ValueChart points={points} /> : <Empty />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Investment gain/loss over time</CardTitle>
              <CardDescription>Value minus net money invested</CardDescription>
            </div>
          </CardHeader>
          <CardContent>{points.length > 1 ? <GainChart points={points} height={262} /> : <Empty />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Contributions vs withdrawals</CardTitle>
              <CardDescription>Monthly external cash flows (transfers excluded)</CardDescription>
            </div>
          </CardHeader>
          <CardContent>{monthly.length ? <FlowsChart data={monthly.slice(-24)} /> : <Empty text="No contributions or withdrawals in this period." />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Account performance</CardTitle>
              <CardDescription>Time-weighted return since each account&apos;s first valuation</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ComparisonChart
              rows={accounts.map((m) => ({
                label: m.account.name,
                value: m.performance.twr.value,
                note: m.performance.twr.reliability === 'estimate' ? 'Estimate' : undefined,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Performance by account</CardTitle>
            <CardDescription>
              Same method everywhere. <Link href="/settings#methodology" className="underline underline-offset-2">How it&apos;s calculated</Link>
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto pt-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">Account</th>
                <th className="py-2 text-right font-medium">Value</th>
                <th className="py-2 text-right font-medium">Contributed</th>
                <th className="py-2 text-right font-medium">Withdrawn</th>
                <th className="py-2 text-right font-medium">Gain/loss</th>
                <th className="py-2 text-right font-medium">TWR</th>
                <th className="py-2 text-right font-medium">XIRR p.a.</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((m) => (
                <tr key={m.account.id} className="border-b last:border-0">
                  <td className="py-2.5">
                    <Link href={`/accounts/${m.account.id}`} className="font-medium hover:underline">
                      {m.account.name}
                    </Link>
                  </td>
                  <td className="py-2.5 text-right tabular">{formatMoney(m.currentValue, m.account.currency)}</td>
                  <td className="py-2.5 text-right tabular">{formatMoney(m.performance.contributions + m.performance.startValue, m.account.currency)}</td>
                  <td className="py-2.5 text-right tabular">{formatMoney(m.performance.withdrawals, m.account.currency)}</td>
                  <td className="py-2.5 text-right">
                    <GainText value={m.performance.gain} currency={m.account.currency} />
                  </td>
                  <td className="py-2.5 text-right">
                    <ReturnValue result={m.performance.twr} />
                  </td>
                  <td className="py-2.5 text-right">
                    <ReturnValue result={m.performance.xirr} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-medium">
                <td className="py-2.5">Portfolio</td>
                <td className="py-2.5 text-right tabular">{formatMoney(model.totalValue)}</td>
                <td className="py-2.5 text-right tabular">{formatMoney(model.contributions + model.openingBalances)}</td>
                <td className="py-2.5 text-right tabular">{formatMoney(model.withdrawals)}</td>
                <td className="py-2.5 text-right">
                  <GainText value={model.gain} />
                </td>
                <td className="py-2.5 text-right">
                  <ReturnValue result={model.performance.twr} />
                </td>
                <td className="py-2.5 text-right">
                  <ReturnValue result={model.performance.xirr} />
                </td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            Contributed includes opening values. Account figures count transfers between your accounts; the portfolio row does not. Annualised TWR:{' '}
            {model.performance.twr.annualised != null ? formatPercent(model.performance.twr.annualised) : 'needs a year of data'}.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {[
          { title: 'By account', slices: allocationByAccount(model) },
          { title: 'By asset class', slices: allocationByAssetClass(model) },
          { title: 'By holding', slices: allocationByHolding(model, toBase) },
        ].map((c) => (
          <Card key={c.title}>
            <CardHeader>
              <CardTitle>Allocation {c.title.toLowerCase()}</CardTitle>
            </CardHeader>
            <CardContent>
              <AllocationChart slices={c.slices} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Empty({ text = 'Record at least two valuations to see this chart.' }: { text?: string }) {
  return <p className="py-16 text-center text-sm text-muted-foreground">{text}</p>;
}
