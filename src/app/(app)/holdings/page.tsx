'use client';

import * as React from 'react';
import { Eye, LineChart, Loader2, Pencil, Plus, RefreshCw, Search, ShoppingCart, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EmptyState, ErrorState, GainText, Money, Notice, PageHeader, PageSkeleton, PercentText, PriceBadge, StatCard } from '@/components/common';
import { useData } from '@/components/providers/data-provider';
import { HoldingCard, HoldingTable } from '@/components/shared/lists';
import { HoldingPerformance } from '@/components/shared/holding-performance';
import { AssetDialog, HoldingDialog } from '@/components/forms/holding-form';
import { TransactionDialog } from '@/components/forms/transaction-form';
import { convertOrSame } from '@/lib/finance/fx';
import { resolvePrice, type HoldingPosition } from '@/lib/finance/holdings';
import { formatDateTime, formatMoney, formatPrice, formatUnits, relativeTime } from '@/lib/format';
import { ASSET_TYPES, ASSET_TYPE_LABELS, type Asset } from '@/lib/types';

const STATUS_TEXT: Record<string, string> = {
  rate_limited: 'Rate limit reached',
  not_found: 'Ticker not found',
  error: 'Provider error',
  no_provider: 'No provider',
  stale: 'Showing last known price',
};

export default function HoldingsPage() {
  const { status, error, reload, model, data, price, refreshPrices, fx, mode } = useData();
  const [query, setQuery] = React.useState('');
  const [accountFilter, setAccountFilter] = React.useState('all');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [sort, setSort] = React.useState<{ key: string; dir: 1 | -1 }>({ key: 'value', dir: -1 });
  const [selected, setSelected] = React.useState<HoldingPosition | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [watchAdd, setWatchAdd] = React.useState(false);
  const [editAsset, setEditAsset] = React.useState<Asset | undefined>();
  const [removeAsset, setRemoveAsset] = React.useState<Asset | undefined>();
  const { update, remove } = useData();

  if (status === 'loading') return <PageSkeleton />;
  if (status === 'error') return <ErrorState message={error ?? ''} onRetry={reload} />;

  const toBase = (v: number, ccy: string) => convertOrSame(v, ccy, 'GBP', fx.rates).toNumber();
  const q = query.trim().toLowerCase();
  const positions = model.positions
    .filter((p) => !p.account.is_archived)
    .filter((p) => accountFilter === 'all' || p.account.id === accountFilter)
    .filter((p) => typeFilter === 'all' || p.asset.asset_type === typeFilter)
    .filter((p) => !q || p.asset.name.toLowerCase().includes(q) || p.asset.symbol?.toLowerCase().includes(q))
    .sort((a, b) => {
      const val = (p: HoldingPosition): number | string => {
        switch (sort.key) {
          case 'name':
            return (p.asset.symbol ?? p.asset.name).toLowerCase();
          case 'account':
            return p.account.name.toLowerCase();
          case 'units':
            return p.units;
          case 'gain':
            return toBase(p.unrealisedGain ?? 0, p.account.currency);
          case 'return':
            return p.unrealisedReturn ?? -Infinity;
          default:
            return toBase(p.valueForTotals, p.account.currency);
        }
      };
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });

  const totalValue = positions.reduce((s, p) => s + toBase(p.valueForTotals, p.account.currency), 0);
  const totalGain = positions.reduce((s, p) => s + toBase(p.unrealisedGain ?? 0, p.account.currency), 0);
  const totalCost = positions.filter((p) => p.unrealisedGain != null).reduce((s, p) => s + toBase(p.costBasis, p.account.currency), 0);
  const realised = positions.reduce((s, p) => s + toBase(p.realisedGain, p.account.currency), 0);
  const dividends = positions.reduce((s, p) => s + toBase(p.dividends, p.account.currency), 0);
  const watchlist = data.assets.filter((a) => a.on_watchlist);
  const accountsWithHoldings = data.accounts.filter((a) => data.holdings.some((h) => h.account_id === a.id));
  const problems = Object.entries(price.statuses).filter(([, s]) => s !== 'fresh' && s !== 'cached');
  const onSort = (key: string) => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === 'name' || key === 'account' ? 1 : -1 }));

  const refreshButton = (
    <Button variant="outline" aria-label="Refresh prices" onClick={() => refreshPrices(true)} disabled={price.refreshing}>
      {price.refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      <span className="hidden sm:inline">Refresh prices</span>
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Holdings"
        description={
          price.lastRefresh
            ? `Prices checked ${relativeTime(price.lastRefresh)}${price.providers.length ? ` · ${price.providers.join(', ')}` : ''}`
            : mode === 'demo'
              ? 'Demo prices'
              : 'Stocks, ETFs and funds across your accounts'
        }
        actions={
          <>
            {refreshButton}
            <Button onClick={() => setAdding(true)}>
              <Plus /> Add holding
            </Button>
          </>
        }
      />

      {mode === 'supabase' && price.providers.length === 0 && data.assets.some((a) => a.symbol && a.price_mode === 'market') ? (
        <Notice tone="warn" className="mb-4">
          No market data API key is configured, so prices fall back to the manual price you entered (or cost). Add <code>ALPHA_VANTAGE_API_KEY</code> (shares and ETFs) or <code>EODHD_API_KEY</code> (UK funds) to enable automatic prices (see Settings → Market data).
        </Notice>
      ) : null}
      {price.error ? (
        <Notice tone="warn" className="mb-4">
          Price service unavailable: {price.error}. Showing the last known or manual prices.
        </Notice>
      ) : null}
      {problems.length > 0 ? (
        <Notice tone="warn" className="mb-4">
          {problems.map(([sym, st]) => `${sym}: ${STATUS_TEXT[st] ?? st}${price.messages[sym] ? ` (${price.messages[sym]})` : ''}`).join(' · ')}
        </Notice>
      ) : null}

      <Tabs defaultValue="holdings">
        <TabsList>
          <TabsTrigger value="holdings">Holdings ({positions.length})</TabsTrigger>
          <TabsTrigger value="watchlist">Watchlist ({watchlist.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="holdings" className="space-y-4">
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Holdings summary">
            <StatCard label="Market value" value={<Money value={totalValue} />} sub="Tracked holdings, in GBP" />
            <StatCard label="Unrealised gain" value={<GainText value={totalGain} />} sub={<PercentText value={totalCost ? totalGain / totalCost : null} />} />
            <StatCard label="Realised gain" value={<GainText value={realised} />} sub="From recorded sells" />
            <StatCard label="Dividends" value={<Money value={dividends} />} sub="Linked dividend income" />
          </section>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or ticker" className="pl-9" aria-label="Search holdings" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <NativeSelect value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} aria-label="Filter by account" className="sm:w-44">
                <option value="all">All accounts</option>
                {accountsWithHoldings.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by type" className="sm:w-36">
                <option value="all">All types</option>
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ASSET_TYPE_LABELS[t]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          {data.holdings.length === 0 ? (
            <EmptyState
              icon={LineChart}
              title="No holdings yet"
              description="Add the shares, ETFs and funds you own. You can enter just the units and average price; trade history is optional."
              action={
                <Button onClick={() => setAdding(true)}>
                  <Plus /> Add holding
                </Button>
              }
            />
          ) : positions.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No holdings match these filters.</p>
          ) : (
            <>
              <div className="space-y-2 md:hidden">
                <NativeSelect value={sort.key} onChange={(e) => setSort({ key: e.target.value, dir: e.target.value === 'name' || e.target.value === 'account' ? 1 : -1 })} aria-label="Sort by" className="mb-1">
                  <option value="value">Sort: value</option>
                  <option value="gain">Sort: unrealised gain</option>
                  <option value="return">Sort: return %</option>
                  <option value="name">Sort: name</option>
                  <option value="account">Sort: account</option>
                </NativeSelect>
                {positions.map((p) => (
                  <HoldingCard key={p.holding.id} p={p} onClick={() => setSelected(p)} />
                ))}
              </div>
              <Card className="hidden md:block">
                <HoldingTable positions={positions} onSelect={setSelected} sort={sort} onSort={onSort} />
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="watchlist">
          <div className="mb-3 flex justify-end">
            <Button variant="outline" onClick={() => setWatchAdd(true)}>
              <Star /> Add to watchlist
            </Button>
          </div>
          {watchlist.length === 0 ? (
            <EmptyState icon={Eye} title="Your watchlist is empty" description="Keep an eye on shares and funds you don't own yet." />
          ) : (
            <Card className="divide-y">
              {watchlist.map((a) => {
                const rp = resolvePrice(a, a.symbol ? price.prices[a.symbol] : undefined);
                return (
                  <div key={a.id} className="flex items-center gap-3 p-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{a.symbol ?? a.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium tabular">{formatPrice(rp.price, rp.currency)}</p>
                      <div className="flex items-center justify-end gap-1.5 text-xs">
                        {rp.change_pct != null ? <PercentText value={rp.change_pct} /> : null}
                        <PriceBadge price={rp} />
                      </div>
                    </div>
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${a.name}`} onClick={() => setEditAsset(a)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${a.name} from watchlist`} onClick={() => setRemoveAsset(a)}>
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <HoldingDetail position={selected} onClose={() => setSelected(null)} />
      <HoldingDialog open={adding} onOpenChange={setAdding} />
      <AssetDialog open={watchAdd} onOpenChange={setWatchAdd} watchlist />
      <AssetDialog open={!!editAsset} onOpenChange={(o) => !o && setEditAsset(undefined)} asset={editAsset} />
      <ConfirmDialog
        open={!!removeAsset}
        onOpenChange={(o) => !o && setRemoveAsset(undefined)}
        title="Remove from watchlist?"
        description={removeAsset ? `${removeAsset.name} will be removed from your watchlist.` : ''}
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!removeAsset) return;
          const held = data.holdings.some((h) => h.asset_id === removeAsset.id);
          if (held) await update('assets', removeAsset.id, { on_watchlist: false }, 'Removed from watchlist');
          else await remove('assets', removeAsset.id, 'Removed from watchlist');
        }}
      />
    </div>
  );
}

function HoldingDetail({ position, onClose }: { position: HoldingPosition | null; onClose: () => void }) {
  const { model, remove, price } = useData();
  const [dialog, setDialog] = React.useState<null | 'position' | 'asset' | 'trade' | 'delete'>(null);
  // Keep the latest computed numbers after edits.
  const p = position ? model.positions.find((x) => x.holding.id === position.holding.id) ?? position : null;
  const ccy = p?.account.currency ?? 'GBP';
  const sym = p?.asset.symbol ?? '';
  const st = sym ? price.statuses[sym] : undefined;

  const rows: [string, React.ReactNode][] = p
    ? [
        ['Account', p.account.name],
        ['Ticker / exchange', [p.asset.symbol, p.asset.exchange].filter(Boolean).join(' · ') || '—'],
        ['Asset type', ASSET_TYPE_LABELS[p.asset.asset_type]],
        ['Units held', formatUnits(p.units)],
        ['Average purchase price', formatPrice(p.avgCost, p.asset.currency)],
        ['Total cost basis', formatMoney(p.costBasis, ccy)],
        ['Latest price', <span key="lp" className="inline-flex items-center gap-1.5">{formatPrice(p.price.price, p.price.currency)} <PriceBadge price={p.price} /></span>],
        ['Price updated', p.price.asOf ? `${formatDateTime(p.price.asOf)}${p.price.marketOpen === false ? ' · market closed' : ''}` : '—'],
        ['Market value', p.marketValue != null ? formatMoney(p.marketValue, ccy) : 'Unknown (valued at cost)'],
        ['Unrealised gain/loss', p.unrealisedGain != null ? <GainText key="ug" value={p.unrealisedGain} currency={ccy} pct={p.unrealisedReturn} /> : '—'],
        ['Realised gain/loss', p.hasTrades ? <GainText key="rg" value={p.realisedGain} currency={ccy} /> : 'No recorded sells'],
        ['Dividend income', formatMoney(p.dividends, ccy)],
        ['Fees', formatMoney(p.fees, ccy)],
        ['Quote currency', p.asset.currency === 'GBX' ? 'GBX (pence)' : p.asset.currency],
      ]
    : [];

  return (
    <>
      <Dialog open={!!p && dialog === null} onOpenChange={(o) => !o && onClose()}>
        {p ? (
          <DialogContent title={p.asset.symbol ? `${p.asset.symbol}` : p.asset.name} description={p.asset.symbol ? p.asset.name : undefined}>
            <section className="mb-4" aria-label="Performance">
              <h3 className="mb-2 text-sm font-semibold">Performance</h3>
              <HoldingPerformance p={p} />
            </section>
            <dl className="divide-y text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium tabular">{v}</dd>
                </div>
              ))}
            </dl>
            {st && st !== 'fresh' && st !== 'cached' ? <Notice tone="warn" className="mt-3">{STATUS_TEXT[st] ?? st}{price.messages[sym] ? `: ${price.messages[sym]}` : ''}</Notice> : null}
            {p.warnings.map((w) => (
              <Notice key={w} tone="warn" className="mt-2">{w}</Notice>
            ))}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setDialog('trade')}>
                <ShoppingCart /> Record trade
              </Button>
              <Button variant="outline" onClick={() => setDialog('position')}>
                <Pencil /> Edit position
              </Button>
              <Button variant="outline" onClick={() => setDialog('asset')}>
                <Pencil /> Edit price / details
              </Button>
              <Button variant="outline" className="text-destructive" onClick={() => setDialog('delete')}>
                <Trash2 /> Remove
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
      {p ? (
        <>
          <HoldingDialog open={dialog === 'position'} onOpenChange={(o) => !o && setDialog(null)} holding={p.holding} />
          <AssetDialog open={dialog === 'asset'} onOpenChange={(o) => !o && setDialog(null)} asset={p.asset} />
          <TransactionDialog open={dialog === 'trade'} onOpenChange={(o) => !o && setDialog(null)} holdingId={p.holding.id} accountId={p.account.id} defaultType="buy" />
          <ConfirmDialog
            open={dialog === 'delete'}
            onOpenChange={(o) => !o && setDialog(null)}
            title={`Remove ${p.asset.symbol ?? p.asset.name} from ${p.account.name}?`}
            description="The holding is removed. Linked transactions are kept but unlinked from it."
            confirmLabel="Remove"
            onConfirm={async () => {
              if (await remove('holdings', p.holding.id, 'Holding removed')) onClose();
            }}
          />
        </>
      ) : null}
    </>
  );
}
