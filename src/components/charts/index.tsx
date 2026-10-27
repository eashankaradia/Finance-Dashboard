'use client';

import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { formatDate, formatMoney, formatMonth, formatPercent } from '@/lib/format';
import type { SeriesPoint } from '@/lib/finance/portfolio';
import type { PeriodTotal } from '@/lib/finance/flows';
import { cn } from '@/lib/utils';

export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);
const GRID = 'hsl(var(--chart-grid))';
const AXIS_TICK = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };

const compact = (v: number) => formatMoney(v, 'GBP', { compact: true });

function TooltipShell({ children }: { children: React.ReactNode }) {
  return <div className="min-w-44 rounded-xl border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">{children}</div>;
}

function Row({ swatch, label, value, dashed }: { swatch?: string; label: string; value: React.ReactNode; dashed?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {swatch ? <span className={cn('inline-block h-0.5 w-3 rounded', dashed && 'border-t-2 border-dashed bg-transparent')} style={{ background: dashed ? undefined : swatch, borderColor: swatch }} /> : null}
        {label}
      </span>
      <span className="font-medium tabular">{value}</span>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean; hollow?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          {i.hollow ? (
            <span className="inline-block size-2 rounded-full border-2" style={{ borderColor: i.color }} />
          ) : (
            <span className={cn('inline-block h-0.5 w-3.5 rounded', i.dashed && 'border-t-2 border-dashed')} style={{ background: i.dashed ? 'transparent' : i.color, borderColor: i.color }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}

function tickDate(span: number) {
  return (d: string) => (span > 400 ? formatMonth(d.slice(0, 7)) : formatDate(d, 'short'));
}

/** Portfolio (or account) value over time, with net invested capital. */
export function ValueChart({ points, showInvested = true, height = 240 }: { points: SeriesPoint[]; showInvested?: boolean; height?: number }) {
  const span = points.length > 1 ? (Date.parse(points[points.length - 1].date) - Date.parse(points[0].date)) / 86400000 : 0;
  const showDots = points.length <= 60;
  const id = React.useId().replace(/:/g, '');

  const Dot = (props: { cx?: number; cy?: number; payload?: SeriesPoint; index?: number }) => {
    const { cx, cy, payload, index } = props;
    if (!showDots || cx == null || cy == null || !payload) return <g key={index} />;
    return payload.estimated ? (
      <circle key={index} cx={cx} cy={cy} r={3.5} fill="hsl(var(--card))" stroke={SERIES[0]} strokeWidth={1.5} />
    ) : (
      <circle key={index} cx={cx} cy={cy} r={3.5} fill={SERIES[0]} stroke="hsl(var(--card))" strokeWidth={2} />
    );
  };

  return (
    <div className="space-y-2">
      <div style={{ height }} role="img" aria-label="Value over time chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.22} />
                <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={tickDate(span)} minTickGap={28} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={52} domain={['auto', 'auto']} />
            <Tooltip
              cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeDasharray: '3 3' }}
              content={({ active, payload }: TooltipProps<number, string>) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as SeriesPoint;
                return (
                  <TooltipShell>
                    <p className="mb-1 font-medium">{formatDate(p.date, 'long')}</p>
                    <Row swatch={SERIES[0]} label="Value" value={formatMoney(p.value)} />
                    {showInvested ? <Row swatch="hsl(var(--muted-foreground))" dashed label="Net invested" value={formatMoney(p.invested)} /> : null}
                    {showInvested ? <Row label="Gain / loss" value={<span className={p.gain >= 0 ? 'text-gain' : 'text-loss'}>{formatMoney(p.gain, 'GBP', { sign: true })}</span>} /> : null}
                    <p className={cn('mt-1.5 border-t pt-1.5', p.estimated ? 'text-warn' : 'text-muted-foreground')}>
                      {p.estimated
                        ? `Estimated: interpolated for ${p.estimatedAccounts.length ? p.estimatedAccounts.join(', ') : 'some accounts'}`
                        : 'Recorded / calculated values'}
                    </p>
                  </TooltipShell>
                );
              }}
            />
            {showInvested ? <Line type="stepAfter" dataKey="invested" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} /> : null}
            <Area type="monotone" dataKey="value" stroke={SERIES[0]} strokeWidth={2} fill={`url(#fill-${id})`} dot={<Dot />} activeDot={{ r: 5, strokeWidth: 2, stroke: 'hsl(var(--card))' }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Legend
        items={[
          { label: 'Value', color: SERIES[0] },
          ...(showInvested ? [{ label: 'Net invested', color: 'hsl(var(--muted-foreground))', dashed: true }] : []),
          ...(showDots ? [{ label: 'Estimated point', color: SERIES[0], hollow: true }] : []),
        ]}
      />
    </div>
  );
}

/** Investment gain/loss over time: green above zero, red below. */
export function GainChart({ points, height = 200 }: { points: SeriesPoint[]; height?: number }) {
  const id = React.useId().replace(/:/g, '');
  const values = points.map((p) => p.gain);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const zero = max === min ? 0.5 : max / (max - min);
  const span = points.length > 1 ? (Date.parse(points[points.length - 1].date) - Date.parse(points[0].date)) / 86400000 : 0;
  return (
    <div style={{ height }} role="img" aria-label="Investment gain or loss over time">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`split-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor="hsl(var(--gain))" stopOpacity={0.25} />
              <stop offset={zero} stopColor="hsl(var(--gain))" stopOpacity={0.05} />
              <stop offset={zero} stopColor="hsl(var(--loss))" stopOpacity={0.05} />
              <stop offset={1} stopColor="hsl(var(--loss))" stopOpacity={0.25} />
            </linearGradient>
            <linearGradient id={`stroke-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={zero} stopColor="hsl(var(--gain))" />
              <stop offset={zero} stopColor="hsl(var(--loss))" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={tickDate(span)} minTickGap={28} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={52} />
          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
          <Tooltip
            content={({ active, payload }: TooltipProps<number, string>) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as SeriesPoint;
              return (
                <TooltipShell>
                  <p className="mb-1 font-medium">{formatDate(p.date, 'long')}</p>
                  <Row label="Gain / loss" value={<span className={p.gain >= 0 ? 'text-gain' : 'text-loss'}>{formatMoney(p.gain, 'GBP', { sign: true })}</span>} />
                  <Row label="Value" value={formatMoney(p.value)} />
                  <Row label="Net invested" value={formatMoney(p.invested)} />
                  {p.estimated ? <p className="mt-1 text-warn">Includes estimated values</p> : null}
                </TooltipShell>
              );
            }}
          />
          <Area type="monotone" dataKey="gain" stroke={`url(#stroke-${id})`} strokeWidth={2} fill={`url(#split-${id})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Contributions vs withdrawals per month/year. */
export function FlowsChart({ data, height = 220, period = 'month' }: { data: PeriodTotal[]; height?: number; period?: 'month' | 'year' }) {
  const rows = data.map((d) => ({ ...d, label: period === 'month' ? formatMonth(d.key) : d.key }));
  return (
    <div className="space-y-2">
      <div style={{ height }} role="img" aria-label="Contributions and withdrawals chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={16} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={52} />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted))', opacity: 0.6 }}
              content={({ active, payload }: TooltipProps<number, string>) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as PeriodTotal & { label: string };
                return (
                  <TooltipShell>
                    <p className="mb-1 font-medium">{p.label}</p>
                    <Row swatch={SERIES[0]} label="Contributions" value={formatMoney(p.contributions)} />
                    <Row swatch={SERIES[1]} label="Withdrawals" value={formatMoney(p.withdrawals)} />
                    <Row label="Net" value={formatMoney(p.net, 'GBP', { sign: true })} />
                  </TooltipShell>
                );
              }}
            />
            <Bar dataKey="contributions" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            <Bar dataKey="withdrawals" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legend items={[{ label: 'Contributions', color: SERIES[0] }, { label: 'Withdrawals', color: SERIES[1] }]} />
    </div>
  );
}

export interface Slice {
  key: string;
  label: string;
  value: number;
}

/** Fold to at most 7 slices + "Other" so colours are never cycled. */
export function foldSlices(slices: Slice[], max = 7): Slice[] {
  const sorted = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= max + 1) return sorted;
  const head = sorted.slice(0, max);
  const rest = sorted.slice(max).reduce((s, x) => s + x.value, 0);
  return [...head, { key: '__other', label: 'Other', value: rest }];
}

export function AllocationChart({ slices, currency = 'GBP' }: { slices: Slice[]; currency?: string }) {
  const data = foldSlices(slices);
  const total = data.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return <p className="py-8 text-center text-sm text-muted-foreground">Nothing to show yet</p>;
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative size-40 shrink-0" role="img" aria-label="Allocation chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="100%" paddingAngle={data.length > 1 ? 1.5 : 0} stroke="hsl(var(--card))" strokeWidth={2} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={d.key} fill={d.key === '__other' ? 'hsl(var(--muted-foreground))' : SERIES[i]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }: TooltipProps<number, string>) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as Slice;
                return (
                  <TooltipShell>
                    <p className="font-medium">{d.label}</p>
                    <Row label="Value" value={formatMoney(d.value, currency)} />
                    <Row label="Share" value={formatPercent(d.value / total, { sign: false, dp: 1 })} />
                  </TooltipShell>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.key} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: d.key === '__other' ? 'hsl(var(--muted-foreground))' : SERIES[i] }} />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="shrink-0 tabular text-muted-foreground">
              {formatPercent(d.value / total, { sign: false, dp: 1 })}
              <span className="ml-2 inline-block min-w-14 text-right text-foreground">{formatMoney(d.value, currency, { compact: true })}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars comparing a return per account (polarity coloured). */
export function ComparisonChart({ rows, height }: { rows: { label: string; value: number | null; note?: string }[]; height?: number }) {
  const data = rows.filter((r) => r.value != null) as { label: string; value: number; note?: string }[];
  if (data.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">Not enough valuation history yet</p>;
  return (
    <div style={{ height: height ?? Math.max(120, data.length * 40) }} role="img" aria-label="Account performance comparison">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v) => formatPercent(v, { dp: 0 })} />
          <YAxis type="category" dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} width={110} />
          <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
          <Tooltip
            cursor={{ fill: 'hsl(var(--muted))', opacity: 0.6 }}
            content={({ active, payload }: TooltipProps<number, string>) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as { label: string; value: number; note?: string };
              return (
                <TooltipShell>
                  <p className="font-medium">{d.label}</p>
                  <Row label="Time-weighted return" value={<span className={d.value >= 0 ? 'text-gain' : 'text-loss'}>{formatPercent(d.value)}</span>} />
                  {d.note ? <p className="mt-1 text-warn">{d.note}</p> : null}
                </TooltipShell>
              );
            }}
          />
          <Bar dataKey="value" radius={4} maxBarSize={20} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.value >= 0 ? 'hsl(var(--gain))' : 'hsl(var(--loss))'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
