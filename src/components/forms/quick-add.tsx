'use client';

import * as React from 'react';
import { ArrowLeftRight, Camera, Landmark, LineChart, PiggyBank } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AccountDialog } from './account-form';
import { HoldingDialog } from './holding-form';
import { SnapshotDialog } from './snapshot-form';
import { TransactionDialog } from './transaction-form';

type Which = 'snapshot' | 'deposit' | 'transfer' | 'transaction' | 'holding' | 'account' | null;

export function QuickAdd({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState<Which>(null);
  const close = (o: boolean) => !o && setOpen(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuItem onSelect={() => setOpen('snapshot')}>
            <Camera /> Record a valuation
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpen('deposit')}>
            <PiggyBank /> Add contribution
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpen('transfer')}>
            <ArrowLeftRight /> Transfer between accounts
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpen('transaction')}>
            <ArrowLeftRight /> Other transaction
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setOpen('holding')}>
            <LineChart /> Add holding
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpen('account')}>
            <Landmark /> New account
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SnapshotDialog open={open === 'snapshot'} onOpenChange={close} />
      <TransactionDialog open={open === 'deposit'} onOpenChange={close} defaultType="deposit" />
      <TransactionDialog open={open === 'transfer'} onOpenChange={close} defaultType="transfer" />
      <TransactionDialog open={open === 'transaction'} onOpenChange={close} defaultType="withdrawal" />
      <HoldingDialog open={open === 'holding'} onOpenChange={close} />
      <AccountDialog open={open === 'account'} onOpenChange={close} />
    </>
  );
}
