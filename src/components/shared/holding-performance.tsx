'use client';

import * as React from 'react';
import { ValueChart } from '@/components/charts';
import { Notice, PercentText } from '@/components/common';
import { Skeleton } from '@/components/ui/skeleton';
import { Segmented } from '@/components/ui/tabs';
import { useData } from '@/components/providers/data-provider';
import { demoPriceHistory } from '@/lib/data/demo';
import { holdingHistory, knownSince, priceReturn, RETURN_PERIODS, type PricePoint } from '@/lib/finance/history';
import type { HoldingPosition } from '@/lib/finance/holdings';
import type { SeriesPoint } from '@/lib/finance/portfolio';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { addMonths } from '@/lib/dates';
import { formatDate } from '@/lib/format';

function usePriceHistory(symbol: string | null): { prices: PricePoint[]; loading: boolean; error: string | null } {
  const { mode } = useData();
  const [state, setState] = React.useState<{ prices: PricePoint[]; loading: boolean; error: string | null }>({ prices: [], loading: true, error: null });

  React.useEffect(() => {
    let cancelled = false;
    if (!symbol) {
      setState({ prices: [], loading: false, error: null });
      return;
    }
    if (mode === 'demo') {
      setState({ prices: demoPriceHistory(symbol), loading: false, error: null });
      return;
    }
    const sb = getBrowserSupabase();
    if (!sb) {
      setState({ prices: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    // The API returns at most 1,000 rows per request, so page through.
    (async () => {
      const rows: PricePoint[] = [];
      for (let page = 0; page < 20; page++) {
        const { data, error } = await sb
          .from('price_history')
          .select('price_date, close')
          .eq('symbol', symbol.toUpperCase())
          .order('price_date', { ascending: false })
          .range(page * 1000, page * 1000 + 999);
        if (error) return { rows, error: error.message };
        rows.push(...(data ?? []).map((r) => ({ date: r.price_date as string, close: Number(r.close) })));
        if (!data || data.length < 1000) break;
      }
      return { rows, error: null };
    })().then(({ rows, error }) => {
      if (!cancelled) setState({ prices: rows, loading: false, error });
    });
    return () => {
      cancelled = true;
    };
  }, [symbol, mode]);

  return state;
}

const RANGES = [
  { value: '1Y', label: '1Y', months: 12 },
  { value: '3Y', label: '3Y', months: 36 },
  { value: '5Y', label: '5Y', months: 60 },
  { value: 'MAX', label: 'Max', months: null },
] as const;
type Range = (typeof RANGES)[number]['value'];

const toPoint = (date: string, value: number): SeriesPoint => ({ date, value, invested: 0, gain: 0, estimated: false, estimatedAccounts: [] });

/** Price and value charts and price returns for one holding. */
export function HoldingPerformance({ p }: { p: HoldingPosition }) {
  const { data, fx } = useData();
  const symbol = p.asset.price_mode === 'market' ? p.asset.symbol : null;
  const { prices, loading, error } = usePriceHistory(symbol);
  const [view, setView] = React.useState<'price' | 'value'>('price');
  const [range, setRange] = React.useState<Range>('1Y');

  const since = React.useMemo(() => {
    const snaps = data.snapshots.filter((s) => s.account_id === p.account.id).map((s) => s.valued_on);
    const first = snaps.length ? snaps.reduce((a, b) => (a < b ? a : b)) : null;
    return knownSince(p.holding, data.transactions, first, p.account.opened_on);
  }, [data.snapshots, data.transactions, p.holding, p.account]);

  const sorted = React.useMemo(() => [...prices].sort((a, b) => a.date.localeCompare(b.date)), [prices]);
  const latest = sorted.length ? sorted[sorted.length - 1].date : null;
  const months = RANGES.find((r) => r.value === range)!.months;
  const from = latest && months ? addMonths(latest, -months) : null;
  const inRange = React.useMemo(() => sorted.filter((x) => !from || x.date >= from), [sorted, from]);

  const pricePoints = React.useMemo(() => inRange.map((x) => toPoint(x.date, x.close)), [inRange]);
  const valuePoints = React.useMemo(
    () =>
      holdingHistory(p.holding, p.asset, p.account, data.transactions, inRange.filter((x) => !since || x.date >= since), fx.rates).map((h) => toPoint(h.date, h.value)),
    [p.holding, p.asset, p.account, data.transactions, inRange, since, fx.rates],
  );

  if (!symbol) {
    return <p className="text-xs text-muted-foreground">Price history is collected for investments with a ticker or ISIN that are priced automatically.</p>;
  }
  if (loading) return <Skeleton className="h-48 w-full" />;
  if (error) return <Notice tone="warn">Couldn&apos;t load price history: {error}</Notice>;
  if (sorted.length < 2) {
    return (
      <p className="text-xs text-muted-foreground">
        No price history yet. Prices are saved automatically every weekday evening; for UK funds the first run also fetches the past year.
      </p>
    );
  }

  const points = view === 'price' ? pricePoints : valuePoints;
  const available = RANGES.filter((r) => r.months == null || r.months === 12 || (sorted[0].date <= addMonths(latest!, -r.months + 1)));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
        {RETURN_PERIODS.map(({ key, months }) => (
          <div key={key} className="rounded-xl bg-muted/60 px-1 py-1.5">
            <p className="text-[11px] text-muted-foreground">{key}</p>
            <PercentText value={priceReturn(sorted, months)} className="text-sm font-semibold" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented label="Chart" value={view} onChange={setView} options={[{ value: 'price', label: 'Price' }, { value: 'value', label: 'Your value' }]} />
        <Segmented label="Period" value={range} onChange={setRange} options={available.map((r) => ({ value: r.value, label: r.label }))} />
      </div>
      {points.length > 1 ? (
        <ValueChart points={points} showInvested={false} height={180} label={view === 'price' ? 'Price' : 'Value'} currency={view === 'price' ? p.asset.currency : p.account.currency} />
      ) : (
        <p className="py-8 text-center text-xs text-muted-foreground">No value history in this period.</p>
      )}
      <p className="text-[11px] text-muted-foreground">
        Prices from {formatDate(sorted[0].date)} to {formatDate(latest)}.{' '}
        {view === 'value'
          ? `Value = units held each day × that day's price${since ? `, from ${formatDate(since)} when your holding is first recorded` : ''}.`
          : 'Returns show the price change only, so money added or taken out doesn\'t affect them.'}
      </p>
    </div>
  );
}
