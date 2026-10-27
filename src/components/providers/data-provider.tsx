'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { DEMO_FX, demoPrices } from '@/lib/data/demo';
import { LocalDemoRepository, SupabaseRepository, type Collection, type Repository, type Row, type TransferInput } from '@/lib/data/repository';
import type { FxRates } from '@/lib/finance/fx';
import { buildPortfolio, type PortfolioModel } from '@/lib/finance/portfolio';
import { getBrowserSupabase } from '@/lib/supabase/client';
import type { Dataset, MarketPrice } from '@/lib/types';
import { EMPTY_DATASET } from '@/lib/types';
import type { ProviderUsage, QuoteStatus } from '@/lib/market/service';

export interface PriceState {
  prices: Record<string, MarketPrice>;
  statuses: Record<string, QuoteStatus>;
  messages: Record<string, string>;
  providers: string[];
  usage: ProviderUsage[];
  refreshing: boolean;
  lastRefresh: string | null;
  error: string | null;
}

export interface FxState {
  rates: FxRates;
  asOf: string | null;
  source: string;
  fallback: boolean;
}

interface DataContextValue {
  mode: 'supabase' | 'demo';
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  data: Dataset;
  model: PortfolioModel;
  price: PriceState;
  fx: FxState;
  reload: () => Promise<void>;
  refreshPrices: (force?: boolean) => Promise<void>;
  insert: <C extends Collection>(c: C, row: Partial<Row<C>>, message?: string) => Promise<Row<C> | null>;
  update: <C extends Collection>(c: C, id: string, patch: Partial<Row<C>>, message?: string) => Promise<boolean>;
  remove: (c: Collection, id: string, message?: string) => Promise<boolean>;
  removeTransfer: (groupId: string) => Promise<boolean>;
  createTransfer: (input: TransferInput) => Promise<boolean>;
  resetDemo: () => Promise<void>;
}

const DataContext = React.createContext<DataContextValue | null>(null);

export function useData(): DataContextValue {
  const ctx = React.useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/foreign key/i.test(msg) && /assets/i.test(msg)) return 'This investment is still held in an account. Remove the holding first.';
  if (/duplicate key.*holdings/i.test(msg) || /holdings_account_id_asset_id_key/.test(msg)) return 'That investment is already held in this account.';
  if (/assets_user_symbol_uidx/.test(msg)) return 'You already have an investment with that ticker.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Network error. Check your connection and try again.';
  return msg;
}

export function DataProvider({ mode, children }: { mode: 'supabase' | 'demo'; children: React.ReactNode }) {
  const repo = React.useMemo<Repository>(() => {
    const sb = mode === 'supabase' ? getBrowserSupabase() : null;
    return sb ? new SupabaseRepository(sb) : new LocalDemoRepository();
  }, [mode]);

  const [status, setStatus] = React.useState<DataContextValue['status']>('loading');
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<Dataset>(EMPTY_DATASET);
  const [fx, setFx] = React.useState<FxState>({ rates: DEMO_FX, asOf: null, source: 'Loading', fallback: true });
  const [price, setPrice] = React.useState<PriceState>({ prices: {}, statuses: {}, messages: {}, providers: [], usage: [], refreshing: false, lastRefresh: null, error: null });

  const reload = React.useCallback(async () => {
    try {
      const d = await repo.load();
      setData(d);
      setStatus('ready');
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
      setStatus('error');
    }
  }, [repo]);

  React.useEffect(() => {
    reload();
    fetch('/api/fx')
      .then((r) => r.json())
      .then((j) => setFx({ rates: j.rates, asOf: j.asOf, source: j.source, fallback: j.fallback }))
      .catch(() => setFx({ rates: DEMO_FX, asOf: null, source: 'Built-in approximate rates', fallback: true }));
  }, [reload]);

  const quoteRequests = React.useMemo(
    () =>
      data.assets
        .filter((a) => a.symbol && a.price_mode === 'market')
        .map((a) => ({ symbol: a.symbol!.toUpperCase(), currency: a.currency })),
    [data.assets],
  );

  const refreshPrices = React.useCallback(
    async (force = false) => {
      if (repo.mode === 'demo') {
        setPrice((p) => ({ ...p, prices: demoPrices(), statuses: {}, providers: ['Demo data'], lastRefresh: new Date().toISOString(), error: null }));
        if (force) toast.success('Demo prices refreshed', { description: 'Demo mode uses fixed sample prices, not live market data.' });
        return;
      }
      if (quoteRequests.length === 0) return;
      setPrice((p) => ({ ...p, refreshing: true }));
      try {
        // Show the shared cache immediately, then ask the server for updates.
        const cached = await repo.loadCachedPrices(quoteRequests.map((q) => q.symbol));
        setPrice((p) => ({ ...p, prices: { ...p.prices, ...cached } }));
        const res = await fetch('/api/prices', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ symbols: quoteRequests, force }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `Price service error (${res.status})`);
        setPrice((p) => ({
          ...p,
          prices: { ...p.prices, ...json.prices },
          statuses: json.statuses,
          messages: json.messages,
          providers: json.providers,
          usage: json.usage ?? [],
          refreshing: false,
          lastRefresh: new Date().toISOString(),
          error: null,
        }));
        if (force) {
          const problems = Object.values(json.statuses as Record<string, QuoteStatus>).filter((s) => s !== 'fresh' && s !== 'cached').length;
          if (problems) toast.warning(`${problems} price${problems > 1 ? 's' : ''} could not be updated`, { description: 'Showing the last known or manual price instead.' });
          else toast.success('Prices updated');
        }
      } catch (e) {
        setPrice((p) => ({ ...p, refreshing: false, error: friendlyError(e) }));
        if (force) toast.error('Could not refresh prices', { description: friendlyError(e) });
      }
    },
    [repo, quoteRequests],
  );

  const symbolsKey = quoteRequests.map((q) => q.symbol).join(',');
  React.useEffect(() => {
    if (status === 'ready') refreshPrices(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, symbolsKey]);

  const model = React.useMemo(() => buildPortfolio({ data, prices: price.prices, rates: fx.rates }), [data, price.prices, fx.rates]);

  const run = React.useCallback(
    async <T,>(fn: () => Promise<T>, message?: string): Promise<T | null> => {
      try {
        const result = await fn();
        await reload();
        if (message) toast.success(message);
        return result;
      } catch (e) {
        toast.error('Something went wrong', { description: friendlyError(e) });
        return null;
      }
    },
    [reload],
  );

  const value: DataContextValue = {
    mode: repo.mode,
    status,
    error,
    data,
    model,
    price,
    fx,
    reload,
    refreshPrices,
    insert: (c, row, message) => run(() => repo.insert(c, row), message),
    update: async (c, id, patch, message) => (await run(async () => (await repo.update(c, id, patch), true), message)) ?? false,
    remove: async (c, id, message) => (await run(async () => (await repo.remove(c, id), true), message)) ?? false,
    removeTransfer: async (g) => (await run(async () => (await repo.removeTransferGroup(g), true), 'Transfer deleted')) ?? false,
    createTransfer: async (input) => (await run(async () => (await repo.createTransfer(input), true), 'Transfer recorded')) ?? false,
    resetDemo: async () => {
      await repo.reset?.();
      await reload();
      toast.success('Demo data reset');
    },
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
