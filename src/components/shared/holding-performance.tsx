'use client';

import * as React from 'react';
import { ValueChart } from '@/components/charts';
import { Notice, PercentText } from '@/components/common';
import { Skeleton } from '@/components/ui/skeleton';
import { useData } from '@/components/providers/data-provider';
import { demoPriceHistory } from '@/lib/data/demo';
import { holdingHistory, priceReturn, RETURN_PERIODS, type PricePoint } from '@/lib/finance/history';
import type { HoldingPosition } from '@/lib/finance/holdings';
import type { SeriesPoint } from '@/lib/finance/portfolio';
import { getBrowserSupabase } from '@/lib/supabase/client';
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
    sb.from('price_history')
      .select('price_date, close')
      .eq('symbol', symbol.toUpperCase())
      .order('price_date', { ascending: false })
      .limit(800)
      .then(({ data, error }) => {
        if (cancelled) return;
        setState({
          prices: (data ?? []).map((r) => ({ date: r.price_date as string, close: Number(r.close) })),
          loading: false,
          error: error ? error.message : null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, mode]);

  return state;
}

/** Value-over-time chart and price returns for one holding. */
export function HoldingPerformance({ p }: { p: HoldingPosition }) {
  const { data, fx } = useData();
  const symbol = p.asset.price_mode === 'market' ? p.asset.symbol : null;
  const { prices, loading, error } = usePriceHistory(symbol);

  const points = React.useMemo<SeriesPoint[]>(
    () =>
      holdingHistory(p.holding, p.asset, p.account, data.transactions, prices, fx.rates).map((h) => ({
        date: h.date,
        value: h.value,
        invested: 0,
        gain: 0,
        estimated: false,
        estimatedAccounts: [],
      })),
    [p.holding, p.asset, p.account, data.transactions, prices, fx.rates],
  );

  if (!symbol) {
    return <p className="text-xs text-muted-foreground">Price history is collected for investments with a ticker or ISIN that are priced automatically.</p>;
  }
  if (loading) return <Skeleton className="h-48 w-full" />;
  if (error) return <Notice tone="warn">Couldn&apos;t load price history: {error}</Notice>;
  if (points.length < 2) {
    return (
      <p className="text-xs text-muted-foreground">
        No price history yet. Prices are saved automatically every weekday evening; for UK funds the first run also fetches the past year.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2 text-center">
        {RETURN_PERIODS.map(({ key, months }) => (
          <div key={key} className="rounded-xl bg-muted/60 px-1 py-1.5">
            <p className="text-[11px] text-muted-foreground">{key}</p>
            <PercentText value={priceReturn(prices, months)} className="text-sm font-semibold" />
          </div>
        ))}
      </div>
      <ValueChart points={points} showInvested={false} height={180} />
      <p className="text-[11px] text-muted-foreground">
        Value = units held each day × that day&apos;s closing price, {formatDate(points[0].date)} to {formatDate(points[points.length - 1].date)}. Returns show the price change only, so money added or taken out doesn&apos;t affect them.
      </p>
    </div>
  );
}
