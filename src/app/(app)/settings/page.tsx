'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronRight, CreditCard, Database, Download, FlaskConical, LineChart, LogOut, RotateCcw, Shield, Sigma } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { PageHeader } from '@/components/common';
import { useData } from '@/components/providers/data-provider';
import { exitDemo, signOut } from '@/components/layout/session-actions';
import { accountsCsv, downloadCsv, holdingsCsv, snapshotsCsv, transactionsCsv } from '@/lib/csv';
import { todayISO } from '@/lib/dates';
import { formatDate, relativeTime } from '@/lib/format';

export default function SettingsPage() {
  const { mode, data, model, price, fx, resetDemo, status } = useData();
  const [confirmReset, setConfirmReset] = React.useState(false);
  const stamp = todayISO();
  const ready = status === 'ready';

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" />

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              {mode === 'demo' ? <FlaskConical className="size-4" /> : <Shield className="size-4" />}
              {mode === 'demo' ? 'Demo mode' : 'Your account'}
            </CardTitle>
            <CardDescription>
              {mode === 'demo'
                ? 'Sample data stored only in this browser. Nothing here is saved to a database or mixed with real records.'
                : 'Your records are stored in Supabase and protected by row-level security: only you can read or change them.'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {mode === 'demo' ? (
            <>
              <Button variant="outline" onClick={() => setConfirmReset(true)}>
                <RotateCcw /> Reset demo data
              </Button>
              <form action={exitDemo}>
                <Button variant="outline" type="submit">
                  <LogOut /> Leave demo
                </Button>
              </form>
            </>
          ) : (
            <form action={signOut}>
              <Button variant="outline" type="submit">
                <LogOut /> Sign out
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Download className="size-4" /> Export
            </CardTitle>
            <CardDescription>Download your records as CSV (opens in Excel, Numbers or Google Sheets)</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button variant="outline" disabled={!ready} onClick={() => downloadCsv(`transactions-${stamp}.csv`, transactionsCsv(data))}>
            Transactions ({data.transactions.length})
          </Button>
          <Button variant="outline" disabled={!ready} onClick={() => downloadCsv(`holdings-${stamp}.csv`, holdingsCsv(model))}>
            Holdings ({data.holdings.length})
          </Button>
          <Button variant="outline" disabled={!ready} onClick={() => downloadCsv(`valuations-${stamp}.csv`, snapshotsCsv(data))}>
            Valuation snapshots ({data.snapshots.length})
          </Button>
          <Button variant="outline" disabled={!ready} onClick={() => downloadCsv(`account-summaries-${stamp}.csv`, accountsCsv(model))}>
            Account summaries ({data.accounts.length})
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <LineChart className="size-4" /> Market data
            </CardTitle>
            <CardDescription>Where prices and exchange rates come from</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Price providers">
            {mode === 'demo' ? (
              <Badge variant="brand">Demo prices (not real)</Badge>
            ) : price.providers.length ? (
              price.providers.map((p) => (
                <Badge key={p} variant="outline">
                  {p}
                </Badge>
              ))
            ) : (
              <Badge variant="warn">None configured</Badge>
            )}
          </Row>
          <Row label="Last price check">{price.lastRefresh ? relativeTime(price.lastRefresh) : '—'}</Row>
          <Row label="Exchange rates">
            {fx.fallback ? <Badge variant="warn">Approximate fallback</Badge> : `${fx.source}${fx.asOf ? `, ${formatDate(fx.asOf)}` : ''}`}
          </Row>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Prices are never real-time. Alpha Vantage&apos;s free tier gives delayed or end-of-day quotes (25 requests/day); Finnhub&apos;s free tier covers US listings only (60/minute). Each price shows when it was last updated and whether the market was closed.</li>
            <li>Prices are fetched on the server, cached for 15 minutes while a market is open and 6 hours when it is closed, and at most 5 symbols are fetched per refresh to respect rate limits.</li>
            <li>When a price can&apos;t be fetched, the app uses your manual price, then the last known price, then the purchase cost, and labels it.</li>
            <li>Funds without a ticker can be priced manually from the holding&apos;s &quot;Edit price / details&quot;.</li>
          </ul>
        </CardContent>
      </Card>

      <Link href="/settings/cards" className="block">
        <Card className="flex items-center gap-3 p-4 transition-colors hover:bg-accent/40">
          <span className="grid size-9 place-items-center rounded-xl bg-muted">
            <CreditCard className="size-4" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-medium">Credit cards</p>
            <p className="text-xs text-muted-foreground">Track statements and due dates ({data.cards.length} cards)</p>
          </div>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Card>
      </Link>

      <Card id="methodology" className="scroll-mt-20">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sigma className="size-4" /> How the numbers are calculated
            </CardTitle>
            <CardDescription>The same rules apply on every page</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <Method title="Account value">
            Each account counts once. For accounts valued by <b>snapshots</b>, the latest snapshot is the value (plus any contributions or withdrawals recorded after it, at zero return). For accounts
            <b> calculated from holdings</b>, the value is units × latest price for each holding, plus the cash balance. Holdings in a snapshot-valued account are shown for information and compared
            with the snapshot, never added on top of it.
          </Method>
          <Method title="Contributions and withdrawals">
            Only deposits and withdrawals are external money. Transfers between your own accounts count for each account but cancel out in the portfolio totals. Buys, sells, dividends, interest
            and fees happen inside an account and are part of performance, not contributions.
          </Method>
          <Method title="Starting point">
            If you recorded contributions from before an account&apos;s first valuation, it starts from £0. Otherwise its first valuation is treated as the opening balance and only later flows
            count. Opening balances are shown separately from contributions.
          </Method>
          <Method title="Investment gain/loss">Current value + withdrawals − contributions − opening balance.</Method>
          <Method title="Time-weighted return (TWR)">
            Measures how the investments performed, regardless of when you added or removed money. Valuations split history into periods; each period&apos;s return uses the Modified Dietz method
            (cash flows weighted by how long they were invested) and periods are chained together. It&apos;s marked <i>Estimate</i> when valuations were interpolated or are far apart around large
            cash flows, and shown as an annual rate once there is a year of data.
          </Method>
          <Method title="Money-weighted return (XIRR)">
            The annual rate of return on your actual cash, taking the timing and size of each contribution and withdrawal into account. Not shown for less than a month of history; marked as an
            estimate with less than a year.
          </Method>
          <Method title="Charts and estimated values">
            Portfolio history is built from your snapshots. Between two snapshots an account&apos;s value is interpolated (adjusted for contributions in between) and marked as estimated: hollow
            points on charts. Filled points are recorded or calculated values.
          </Method>
          <Method title="Holdings">
            Average cost method. Your starting position (units and average price) is entered by hand; linked buys add units and cost (including fees), linked sells realise gains against the
            average cost. Costs in another currency are converted at today&apos;s rate, so foreign holdings&apos; gains exclude currency movements.
          </Method>
          <Method title="Currencies and precision">
            All sums use decimal arithmetic (no floating-point drift) and are stored as exact decimals. Everything is shown in GBP using the latest ECB reference rates; past values in other
            currencies are converted at today&apos;s rate. Dates are UK calendar dates.
          </Method>
        </CardContent>
      </Card>

      <p className="flex items-center gap-1.5 pb-4 text-xs text-muted-foreground">
        <Database className="size-3.5" /> {mode === 'demo' ? 'Demo data in browser storage' : 'Connected to Supabase'}
      </p>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset demo data?"
        description="Any changes you made in the demo will be replaced with fresh sample data."
        confirmLabel="Reset"
        onConfirm={resetDemo}
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex flex-wrap gap-1">{children}</span>
    </div>
  );
}

function Method({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-medium">{title}</p>
      <p className="mt-0.5 text-muted-foreground">{children}</p>
    </div>
  );
}
