'use client';

import * as React from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Info, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ReturnResult } from '@/lib/finance/performance';
import type { ResolvedPrice } from '@/lib/finance/holdings';
import { formatDate, formatDateTime, formatMoney, formatPercent, gainClass, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Money({ value, currency = 'GBP', className, sign, compact }: { value: number | null | undefined; currency?: string; className?: string; sign?: boolean; compact?: boolean }) {
  return <span className={cn('tabular', className)}>{formatMoney(value, currency, { sign, compact })}</span>;
}

export function GainText({ value, currency = 'GBP', pct, className }: { value: number | null | undefined; currency?: string; pct?: number | null; className?: string }) {
  const Icon = value != null && value < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <span className={cn('inline-flex items-center gap-0.5 whitespace-nowrap tabular', gainClass(value), className)}>
      {value != null && value !== 0 ? <Icon className="size-3.5" aria-hidden /> : null}
      {formatMoney(value, currency, { sign: true })}
      {pct != null ? <span className="ml-1 opacity-90">({formatPercent(pct)})</span> : null}
    </span>
  );
}

export function PercentText({ value, className }: { value: number | null | undefined; className?: string }) {
  return <span className={cn('tabular', gainClass(value), className)}>{formatPercent(value)}</span>;
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: LucideIcon;
  hint?: string;
  className?: string;
}) {
  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
        <span>{label}</span>
        {hint ? (
          <span title={hint} className="cursor-help">
            <Info className="size-3" aria-label={hint} />
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 text-lg font-semibold tracking-tight tabular sm:text-xl">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
    </Card>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center', className)}>
      <div className="mb-3 rounded-2xl bg-muted p-3">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <p className="font-medium">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <AlertTriangle className="mb-2 size-6 text-destructive" aria-hidden />
      <p className="font-medium">We couldn&apos;t load your data</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      ) : null}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-36 w-full" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function Notice({ tone = 'info', children, className }: { tone?: 'info' | 'warn'; children: React.ReactNode; className?: string }) {
  const Icon = tone === 'warn' ? AlertTriangle : Info;
  return (
    <div className={cn('flex gap-2 rounded-xl px-3 py-2.5 text-xs', tone === 'warn' ? 'bg-warn/10 text-warn' : 'bg-muted text-muted-foreground', className)}>
      <Icon className="mt-px size-3.5 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Explains how trustworthy a return figure is. */
export function ReturnValue({ result, label, annualise = false, className }: { result: ReturnResult; label?: string; annualise?: boolean; className?: string }) {
  const value = annualise ? result.annualised ?? result.value : result.value;
  if (result.reliability === 'unavailable' || value == null) {
    return (
      <span className={cn('text-muted-foreground', className)} title={result.reason}>
        Not enough data
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <PercentText value={value} />
      {annualise && result.annualised != null ? <span className="text-xs text-muted-foreground">p.a.</span> : null}
      {result.reliability === 'estimate' ? (
        <Badge variant="warn" title={result.reason}>
          Estimate
        </Badge>
      ) : null}
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

export function PriceBadge({ price, className }: { price: ResolvedPrice; className?: string }) {
  if (price.source === 'none') return <Badge variant="warn" className={className}>No price</Badge>;
  if (price.source === 'manual')
    return (
      <Badge variant="outline" className={className} title={`Entered manually ${formatDateTime(price.asOf)}`}>
        Manual · {price.asOf ? formatDate(price.asOf.slice(0, 10), 'short') : 'undated'}
      </Badge>
    );
  if (price.freshness === 'demo') return <Badge variant="brand" className={className}>Demo price</Badge>;
  const label = price.freshness === 'end_of_day' ? `Close ${formatDate(price.asOf?.slice(0, 10), 'short')}` : `Delayed · ${relativeTime(price.asOf)}`;
  return (
    <Badge variant="outline" className={className} title={`Updated ${formatDateTime(price.asOf)}${price.marketOpen === false ? ' · market closed' : ''}`}>
      {label}
      {price.marketOpen === false ? ' · closed' : ''}
    </Badge>
  );
}

export function ValueSourceBadge({ source }: { source: 'snapshot' | 'calculated' | 'none' }) {
  if (source === 'calculated') return <Badge variant="brand">Calculated from holdings</Badge>;
  if (source === 'snapshot') return <Badge variant="outline">Manual valuation</Badge>;
  return <Badge variant="warn">No valuation yet</Badge>;
}

/** Free market data requests left today, per daily-capped provider. */
export function ApiUsage({ usage, className }: { usage: { provider: string; used: number; limit: number }[]; className?: string }) {
  if (!usage.length) return null;
  return (
    <p className={cn('text-xs text-muted-foreground', className)} title="Counts the app's requests since midnight UTC, when the free allowances reset. Cached prices don't use any.">
      Free price checks left today:{' '}
      {usage.map((u, i) => {
        const left = Math.max(0, u.limit - u.used);
        return (
          <span key={u.provider}>
            {i > 0 ? ' · ' : null}
            <span className={cn('font-medium tabular', left <= Math.ceil(u.limit * 0.15) ? 'text-warn' : 'text-foreground')}>
              {left} of {u.limit}
            </span>{' '}
            {u.provider}
          </span>
        );
      })}
    </p>
  );
}
