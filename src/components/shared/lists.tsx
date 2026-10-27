'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronRight,
  Coins,
  MoreHorizontal,
  Pencil,
  Percent,
  Receipt,
  ShoppingCart,
  SlidersHorizontal,
  Tag,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { GainText, Money, PercentText, PriceBadge, ValueSourceBadge } from '@/components/common';
import { useData } from '@/components/providers/data-provider';
import { TransactionDialog } from '@/components/forms/transaction-form';
import type { AccountModel } from '@/lib/finance/portfolio';
import type { HoldingPosition } from '@/lib/finance/holdings';
import { formatDate, formatMoney, formatPrice, formatUnits } from '@/lib/format';
import { ACCOUNT_TYPE_LABELS, ASSET_TYPE_LABELS, TRANSACTION_TYPE_LABELS, type Transaction, type TransactionType } from '@/lib/types';
import { cn } from '@/lib/utils';

const TX_ICONS: Record<TransactionType, React.ComponentType<{ className?: string }>> = {
  deposit: ArrowDownLeft,
  withdrawal: ArrowUpRight,
  transfer_in: ArrowLeftRight,
  transfer_out: ArrowLeftRight,
  buy: ShoppingCart,
  sell: Tag,
  dividend: Coins,
  interest: Percent,
  fee: Receipt,
  adjustment: SlidersHorizontal,
};

/** Sign shown for the cash effect on the account. */
export function txDirection(t: Transaction): 1 | -1 | 0 {
  switch (t.type) {
    case 'deposit':
    case 'transfer_in':
    case 'dividend':
    case 'interest':
    case 'sell':
      return 1;
    case 'withdrawal':
    case 'transfer_out':
    case 'fee':
    case 'buy':
      return -1;
    case 'adjustment':
      return t.amount >= 0 ? 1 : -1;
  }
}

export function TransactionRow({ tx, showAccount = true }: { tx: Transaction; showAccount?: boolean }) {
  const { data, remove, removeTransfer } = useData();
  const [editing, setEditing] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const account = data.accounts.find((a) => a.id === tx.account_id);
  const holding = tx.holding_id ? data.holdings.find((h) => h.id === tx.holding_id) : undefined;
  const asset = holding ? data.assets.find((a) => a.id === holding.asset_id) : undefined;
  const counterpart = tx.transfer_group_id ? data.transactions.find((t) => t.transfer_group_id === tx.transfer_group_id && t.id !== tx.id) : undefined;
  const counterpartAccount = counterpart ? data.accounts.find((a) => a.id === counterpart.account_id) : undefined;
  const Icon = TX_ICONS[tx.type];
  const dir = txDirection(tx);
  const external = tx.type === 'deposit' || tx.type === 'withdrawal';

  const title =
    tx.type === 'transfer_out' && counterpartAccount
      ? `Transfer to ${counterpartAccount.name}`
      : tx.type === 'transfer_in' && counterpartAccount
        ? `Transfer from ${counterpartAccount.name}`
        : asset
          ? `${TRANSACTION_TYPE_LABELS[tx.type]} · ${asset.symbol ?? asset.name}`
          : tx.description || TRANSACTION_TYPE_LABELS[tx.type];

  return (
    <li className="group flex items-center gap-3 py-2.5">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground', external && dir > 0 && 'bg-brand/10 text-brand')}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {formatDate(tx.occurred_on)}
          {showAccount && account ? ` · ${account.name}` : ''}
          {tx.units ? ` · ${formatUnits(tx.units)} units` : ''}
          {asset && tx.description ? ` · ${tx.description}` : ''}
        </p>
      </div>
      <div className="text-right">
        <p className={cn('text-sm font-medium tabular', dir > 0 && (external || tx.type === 'dividend' || tx.type === 'interest') ? 'text-gain' : '')}>
          {dir > 0 ? '+' : '−'}
          {formatMoney(Math.abs(tx.amount), account?.currency)}
        </p>
        <p className="text-[11px] text-muted-foreground">{TRANSACTION_TYPE_LABELS[tx.type]}</p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Transaction actions" className="shrink-0 text-muted-foreground">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem destructive onSelect={() => setConfirming(true)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TransactionDialog open={editing} onOpenChange={setEditing} transaction={tx} />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={tx.transfer_group_id ? 'Delete this transfer?' : 'Delete this transaction?'}
        description={tx.transfer_group_id ? 'Both sides of the transfer will be removed.' : `${TRANSACTION_TYPE_LABELS[tx.type]} of ${formatMoney(Math.abs(tx.amount), account?.currency)} on ${formatDate(tx.occurred_on)} will be permanently removed.`}
        onConfirm={async () => {
          if (tx.transfer_group_id) await removeTransfer(tx.transfer_group_id);
          else await remove('transactions', tx.id, 'Transaction deleted');
        }}
      />
    </li>
  );
}

export function AccountRow({ model, compact = false }: { model: AccountModel; compact?: boolean }) {
  const a = model.account;
  const perf = model.performance;
  return (
    <Link href={`/accounts/${a.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-accent/60 -mx-2">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-xs font-semibold text-muted-foreground">{a.name.slice(0, 2).toUpperCase()}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
          {a.name}
          {model.discrepancy?.significant ? <AlertTriangle className="size-3.5 text-warn" aria-label="Valuation differs from holdings" /> : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {a.provider ? `${a.provider} · ` : ''}
          {ACCOUNT_TYPE_LABELS[a.account_type]}
          {!compact && model.valueDate ? ` · ${model.valueSource === 'calculated' ? 'live calc' : formatDate(model.valueDate, 'short')}` : ''}
        </p>
      </div>
      <div className="text-right">
        <Money value={model.currentValue} currency={a.currency} className="text-sm font-semibold" />
        <p className="text-xs">
          {perf.endDate ? <GainText value={perf.gain} currency={a.currency} /> : <span className="text-muted-foreground">No valuation</span>}
        </p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

export function AccountSourceLine({ model }: { model: AccountModel }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <ValueSourceBadge source={model.valueSource} />
      {model.account.is_archived ? <Badge variant="outline">Archived</Badge> : null}
    </span>
  );
}

/** Mobile-friendly holding card. */
export function HoldingCard({ p, onClick }: { p: HoldingPosition; onClick?: () => void }) {
  const ccy = p.account.currency;
  return (
    <button onClick={onClick} className="w-full rounded-2xl border bg-card p-3.5 text-left transition-colors hover:bg-accent/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{p.asset.symbol ?? p.asset.name}</p>
          <p className="truncate text-xs text-muted-foreground">{p.asset.symbol ? p.asset.name : ASSET_TYPE_LABELS[p.asset.asset_type]}</p>
        </div>
        <div className="text-right">
          <Money value={p.marketValue ?? p.costBasis} currency={ccy} className="text-sm font-semibold" />
          <p className="text-xs">
            {p.unrealisedGain != null ? <GainText value={p.unrealisedGain} currency={ccy} /> : <span className="text-muted-foreground">at cost</span>}
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular">
          {formatUnits(p.units)} × {formatPrice(p.price.price, p.price.currency)}
        </span>
        <span className="flex items-center gap-1.5">
          <PercentText value={p.unrealisedReturn} />
          <PriceBadge price={p.price} />
        </span>
      </div>
      <p className="mt-1 truncate text-[11px] text-muted-foreground">{p.account.name}</p>
    </button>
  );
}

export function HoldingTable({ positions, onSelect, sort, onSort }: { positions: HoldingPosition[]; onSelect?: (p: HoldingPosition) => void; sort?: { key: string; dir: 1 | -1 }; onSort?: (key: string) => void }) {
  const Th = ({ k, children, right }: { k?: string; children: React.ReactNode; right?: boolean }) => (
    <th scope="col" className={cn('px-3 py-2 text-xs font-medium text-muted-foreground', right && 'text-right')} aria-sort={k && sort?.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      {k && onSort ? (
        <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => onSort(k)}>
          {children}
          {sort?.key === k ? (sort.dir === 1 ? '↑' : '↓') : null}
        </button>
      ) : (
        children
      )}
    </th>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="border-b text-left">
          <tr>
            <Th k="name">Investment</Th>
            <Th k="account">Account</Th>
            <Th k="units" right>Units</Th>
            <Th right>Avg cost</Th>
            <Th right>Price</Th>
            <Th k="value" right>Value</Th>
            <Th k="gain" right>Unrealised</Th>
            <Th k="return" right>Return</Th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.holding.id} onClick={() => onSelect?.(p)} className="cursor-pointer border-b last:border-0 hover:bg-accent/40">
              <td className="px-3 py-2.5">
                <p className="font-medium">{p.asset.symbol ?? p.asset.name}</p>
                <p className="max-w-[220px] truncate text-xs text-muted-foreground">{p.asset.symbol ? p.asset.name : ASSET_TYPE_LABELS[p.asset.asset_type]}</p>
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">{p.account.name}</td>
              <td className="px-3 py-2.5 text-right tabular">{formatUnits(p.units)}</td>
              <td className="px-3 py-2.5 text-right tabular text-muted-foreground">{formatPrice(p.avgCost, p.asset.currency)}</td>
              <td className="px-3 py-2.5 text-right">
                <div className="tabular">{formatPrice(p.price.price, p.price.currency)}</div>
                <PriceBadge price={p.price} className="mt-0.5" />
              </td>
              <td className="px-3 py-2.5 text-right font-medium">
                <Money value={p.marketValue ?? p.costBasis} currency={p.account.currency} />
              </td>
              <td className="px-3 py-2.5 text-right">{p.unrealisedGain != null ? <GainText value={p.unrealisedGain} currency={p.account.currency} /> : '—'}</td>
              <td className="px-3 py-2.5 text-right">
                <PercentText value={p.unrealisedReturn} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
