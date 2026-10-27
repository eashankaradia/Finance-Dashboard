'use client';

import * as React from 'react';
import Link from 'next/link';
import { Archive, Landmark, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState, GainText, Money, PageHeader, PageSkeleton, ReturnValue, ValueSourceBadge } from '@/components/common';
import { useData } from '@/components/providers/data-provider';
import { AccountDialog } from '@/components/forms/account-form';
import { ACCOUNT_TYPE_LABELS } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/format';
import type { AccountModel } from '@/lib/finance/portfolio';

export default function AccountsPage() {
  const { status, error, reload, model } = useData();
  const [creating, setCreating] = React.useState(false);
  const [showArchived, setShowArchived] = React.useState(false);

  if (status === 'loading') return <PageSkeleton />;
  if (status === 'error') return <ErrorState message={error ?? ''} onRetry={reload} />;

  const active = model.accounts.filter((m) => !m.account.is_archived).sort((a, b) => b.currentValueBase - a.currentValueBase);
  const archived = model.accounts.filter((m) => m.account.is_archived);

  return (
    <div>
      <PageHeader
        title="Accounts"
        description={`${active.length} active · ${formatMoney(model.totalValue)} in total`}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> New account
          </Button>
        }
      />
      {model.accounts.length === 0 ? (
        <EmptyState icon={Landmark} title="No accounts yet" description="Add your ISAs, pensions, savings and other pots." action={<Button onClick={() => setCreating(true)}><Plus /> Add account</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {active.map((m) => (
            <AccountCard key={m.account.id} m={m} />
          ))}
        </div>
      )}
      {archived.length > 0 ? (
        <div className="mt-8">
          <Button variant="ghost" size="sm" onClick={() => setShowArchived((s) => !s)}>
            <Archive /> {showArchived ? 'Hide' : 'Show'} {archived.length} archived
          </Button>
          {showArchived ? (
            <div className="mt-3 grid grid-cols-1 gap-3 opacity-80 md:grid-cols-2 xl:grid-cols-3">
              {archived.map((m) => (
                <AccountCard key={m.account.id} m={m} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <AccountDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function AccountCard({ m }: { m: AccountModel }) {
  const a = m.account;
  return (
    <Link href={`/accounts/${a.id}`} className="block">
      <Card className="h-full p-4 transition-colors hover:bg-accent/40">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{a.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[a.provider, ACCOUNT_TYPE_LABELS[a.account_type]].filter(Boolean).join(' · ')}
            </p>
          </div>
          {a.is_archived ? <Badge variant="outline">Archived</Badge> : <ValueSourceBadge source={m.valueSource} />}
        </div>
        <Money value={m.currentValue} currency={a.currency} className="mt-4 block text-2xl font-semibold tracking-tight" />
        <p className="text-xs text-muted-foreground">
          {m.valueSource === 'snapshot' && m.valueDate ? `Valued ${formatDate(m.valueDate)}` : m.valueSource === 'calculated' ? 'Holdings at latest prices' : 'Record a valuation to start tracking'}
          {m.performance.flowsAfterLastValuation !== 0 ? ' + later transactions' : ''}
        </p>
        <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">Gain</span>
          <GainText value={m.performance.gain} currency={a.currency} />
        </div>
        <div className="mt-1 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Time-weighted return</span>
          <ReturnValue result={m.performance.twr} />
        </div>
      </Card>
    </Link>
  );
}
