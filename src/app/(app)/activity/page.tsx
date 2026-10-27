'use client';

import * as React from 'react';
import { ArrowLeftRight, ChevronLeft, ChevronRight, Download, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { Segmented } from '@/components/ui/tabs';
import { FlowsChart } from '@/components/charts';
import { EmptyState, ErrorState, Money, PageHeader, PageSkeleton, StatCard } from '@/components/common';
import { useData } from '@/components/providers/data-provider';
import { TransactionRow } from '@/components/shared/lists';
import { TransactionDialog } from '@/components/forms/transaction-form';
import { groupFlows, toFlows, totalFlows } from '@/lib/finance/flows';
import { convertOrSame } from '@/lib/finance/fx';
import { downloadCsv, transactionsCsv } from '@/lib/csv';
import { formatMoney, formatMonth } from '@/lib/format';
import { TRANSACTION_TYPES, TRANSACTION_TYPE_LABELS } from '@/lib/types';
import { todayISO } from '@/lib/dates';

const PAGE_SIZE = 25;

export default function ActivityPage() {
  const { status, error, reload, data, fx } = useData();
  const [account, setAccount] = React.useState('all');
  const [type, setType] = React.useState('all');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [adding, setAdding] = React.useState(false);
  const [grouping, setGrouping] = React.useState<'month' | 'year'>('month');

  React.useEffect(() => setPage(0), [account, type, from, to, query]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const accountNames = new Map(data.accounts.map((a) => [a.id, a.name.toLowerCase()]));
    return data.transactions
      .filter((t) => account === 'all' || t.account_id === account)
      .filter((t) => type === 'all' || (type === 'transfer' ? t.transfer_group_id != null : t.type === type))
      .filter((t) => !from || t.occurred_on >= from)
      .filter((t) => !to || t.occurred_on <= to)
      .filter((t) => !q || t.description?.toLowerCase().includes(q) || accountNames.get(t.account_id)?.includes(q) || TRANSACTION_TYPE_LABELS[t.type].toLowerCase().includes(q))
      .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at));
  }, [data, account, type, from, to, query]);

  if (status === 'loading') return <PageSkeleton />;
  if (status === 'error') return <ErrorState message={error ?? ''} onRetry={reload} />;

  // A single account sees its own transfers as flows; the whole portfolio does not.
  const scope = account === 'all' ? 'portfolio' : 'account';
  const currencyOf = new Map(data.accounts.map((a) => [a.id, a.currency]));
  const flows = toFlows(filtered, scope, (amt, id) => convertOrSame(amt, currencyOf.get(id) ?? 'GBP', 'GBP', fx.rates));
  const totals = totalFlows(flows);
  const grouped = groupFlows(flows, grouping);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const hasFilters = account !== 'all' || type !== 'all' || from || to || query;
  const clear = () => {
    setAccount('all');
    setType('all');
    setFrom('');
    setTo('');
    setQuery('');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Activity"
        description="Contributions, withdrawals, transfers and trades"
        actions={
          <>
            <Button variant="outline" aria-label="Export CSV" onClick={() => downloadCsv(`transactions-${todayISO()}.csv`, transactionsCsv(data, new Set(filtered.map((t) => t.id))))} disabled={!filtered.length}>
              <Download /> <span className="hidden sm:inline">Export CSV</span>
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus /> Add
            </Button>
          </>
        }
      />

      <Card className="p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-[1fr_180px_180px_150px_150px_auto]">
          <div className="relative col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="pl-9" aria-label="Search transactions" />
          </div>
          <NativeSelect value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Account">
            <option value="all">All accounts</option>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
            <option value="all">All types</option>
            <option value="transfer">Transfers</option>
            {TRANSACTION_TYPES.filter((t) => !t.startsWith('transfer')).map((t) => (
              <option key={t} value={t}>
                {TRANSACTION_TYPE_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          {hasFilters ? (
            <Button variant="ghost" onClick={clear} className="col-span-2 lg:col-span-1">
              <X /> Clear
            </Button>
          ) : null}
        </div>
      </Card>

      <section className="grid grid-cols-3 gap-3" aria-label="Totals">
        <StatCard label="Contributions" value={<Money value={totals.contributions.toNumber()} compact />} />
        <StatCard label="Withdrawals" value={<Money value={totals.withdrawals.toNumber()} compact />} />
        <StatCard label="Net" value={<Money value={totals.net.toNumber()} compact />} />
      </section>
      <p className="-mt-2 text-xs text-muted-foreground">
        {scope === 'portfolio' ? 'Transfers between your accounts are excluded from these totals.' : 'For a single account, transfers in and out are included.'} Trades, dividends, interest and fees are not contributions.
      </p>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>Transactions</CardTitle>
              <CardDescription>
                {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {data.transactions.length === 0 ? (
              <EmptyState icon={ArrowLeftRight} title="No transactions yet" description="Record contributions and withdrawals so returns exclude the money you paid in." action={<Button onClick={() => setAdding(true)}><Plus /> Add transaction</Button>} />
            ) : filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No transactions match these filters.</p>
            ) : (
              <>
                <ul className="divide-y">
                  {visible.map((t) => (
                    <TransactionRow key={t.id} tx={t} />
                  ))}
                </ul>
                {pages > 1 ? (
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
                      <ChevronLeft /> Newer
                    </Button>
                    <span className="text-muted-foreground">
                      Page {page + 1} of {pages}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= pages - 1}>
                      Older <ChevronRight />
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Deposits &amp; withdrawals</CardTitle>
              <CardDescription>{grouping === 'month' ? 'Monthly' : 'Yearly'} totals for the current filters</CardDescription>
            </div>
            <Segmented label="Group by" value={grouping} onChange={setGrouping} options={[{ value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} />
          </CardHeader>
          <CardContent>
            {grouped.length ? (
              <>
                <FlowsChart data={grouping === 'month' ? grouped.slice(-12) : grouped} period={grouping} />
                <div className="mt-4 max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-1.5 font-medium">{grouping === 'month' ? 'Month' : 'Year'}</th>
                        <th className="py-1.5 text-right font-medium">In</th>
                        <th className="py-1.5 text-right font-medium">Out</th>
                        <th className="py-1.5 text-right font-medium">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...grouped].reverse().map((g) => (
                        <tr key={g.key} className="border-t">
                          <td className="py-1.5">{grouping === 'month' ? formatMonth(g.key) : g.key}</td>
                          <td className="py-1.5 text-right tabular">{formatMoney(g.contributions)}</td>
                          <td className="py-1.5 text-right tabular">{formatMoney(g.withdrawals)}</td>
                          <td className="py-1.5 text-right font-medium tabular">{formatMoney(g.net, 'GBP', { sign: true })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">No contributions or withdrawals in this selection.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <TransactionDialog open={adding} onOpenChange={setAdding} accountId={account !== 'all' ? account : undefined} />
    </div>
  );
}
