'use client';

import * as React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Notice } from '@/components/common';
import { useData } from '@/components/providers/data-provider';
import { ASSET_TYPES, ASSET_TYPE_LABELS, type Asset, type AssetType, type Holding } from '@/lib/types';
import { FormActions, hasErrors, optionalAmount, requireAmount, type Errors } from './shared';

const PRICE_CURRENCIES = [
  { value: 'GBX', label: 'GBX (pence)' },
  { value: 'GBP', label: 'GBP (£)' },
  { value: 'USD', label: 'USD ($)' },
  { value: 'EUR', label: 'EUR (€)' },
];

const SYMBOL_RE = /^[A-Za-z0-9.\-:^=]{1,32}$/;

function guessFromSymbol(symbol: string): { exchange: string; currency: string } | null {
  const s = symbol.toUpperCase();
  if (s.endsWith('.LON') || s.endsWith('.L')) return { exchange: 'LSE', currency: 'GBX' };
  if (/^[A-Z]{1,5}$/.test(s)) return { exchange: 'US', currency: 'USD' };
  // UK unit trusts/OEICs by ISIN: platforms usually quote them in pence.
  if (/^GB[A-Z0-9]{9}[0-9]$/.test(s)) return { exchange: 'Fund', currency: 'GBX' };
  return null;
}

/** Asset details fields, shared by the holding and watchlist dialogs. */
export function useAssetFields(asset?: Asset) {
  const blank = () => ({
    name: asset?.name ?? '',
    symbol: asset?.symbol ?? '',
    exchange: asset?.exchange ?? '',
    asset_type: (asset?.asset_type ?? 'stock') as AssetType,
    currency: asset?.currency ?? 'GBX',
    price_mode: asset?.price_mode ?? 'market',
    manual_price: asset?.manual_price != null ? String(asset.manual_price) : '',
  });
  const [fields, setFields] = React.useState(blank);
  const reset = React.useCallback(() => setFields(blank()), [asset]); // eslint-disable-line react-hooks/exhaustive-deps

  function validate(): [Partial<Asset> | null, Errors] {
    const symbol = fields.symbol.trim().toUpperCase();
    const [manual, manualErr] = optionalAmount(fields.manual_price, 'Price');
    const errs: Errors = {
      name: fields.name.trim() ? null : 'Enter a name',
      symbol: symbol && !SYMBOL_RE.test(symbol) ? 'Use letters, numbers and dots only (e.g. VUSA.LON)' : null,
      manual_price: fields.price_mode === 'manual' && !manual ? manualErr ?? 'Enter the latest price' : manualErr,
    };
    if (hasErrors(errs)) return [null, errs];
    const priceChanged = manual != null && Number(manual) !== asset?.manual_price;
    return [
      {
        name: fields.name.trim(),
        symbol: symbol || null,
        exchange: fields.exchange.trim() || null,
        asset_type: fields.asset_type,
        currency: fields.currency,
        price_mode: symbol ? (fields.price_mode as Asset['price_mode']) : 'manual',
        manual_price: manual != null ? Number(manual) : null,
        manual_price_at: priceChanged ? new Date().toISOString() : asset?.manual_price_at ?? null,
      },
      errs,
    ];
  }

  const ui = (errors: Errors) => (
    <div className="space-y-4">
      <Field label="Company or fund name" htmlFor="as-name" error={errors.name}>
        <Input id="as-name" value={fields.name} onChange={(e) => setFields({ ...fields, name: e.target.value })} placeholder="e.g. Vanguard FTSE Global All Cap" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ticker" htmlFor="as-symbol" error={errors.symbol} hint="London: VUSA.LON. US: AAPL. UK funds: the ISIN (GB00…).">
          <Input
            id="as-symbol"
            value={fields.symbol}
            autoCapitalize="characters"
            onChange={(e) => setFields({ ...fields, symbol: e.target.value })}
            onBlur={() => {
              const g = guessFromSymbol(fields.symbol);
              if (g && !fields.exchange) setFields((f) => ({ ...f, exchange: g.exchange, currency: g.currency }));
            }}
            placeholder="Optional"
          />
        </Field>
        <Field label="Exchange / market" htmlFor="as-exch">
          <Input id="as-exch" value={fields.exchange} onChange={(e) => setFields({ ...fields, exchange: e.target.value })} placeholder="LSE, NASDAQ…" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Asset type" htmlFor="as-type">
          <NativeSelect id="as-type" value={fields.asset_type} onChange={(e) => setFields({ ...fields, asset_type: e.target.value as AssetType })}>
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {ASSET_TYPE_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Quoted in" htmlFor="as-ccy" hint="Most LSE shares are quoted in pence.">
          <NativeSelect id="as-ccy" value={fields.currency} onChange={(e) => setFields({ ...fields, currency: e.target.value })}>
            {PRICE_CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Price source" htmlFor="as-mode">
          <NativeSelect id="as-mode" value={fields.symbol.trim() ? fields.price_mode : 'manual'} disabled={!fields.symbol.trim()} onChange={(e) => setFields({ ...fields, price_mode: e.target.value as Asset['price_mode'] })}>
            <option value="market">Market data</option>
            <option value="manual">Manual price</option>
          </NativeSelect>
        </Field>
        <Field
          label={`${fields.price_mode === 'manual' || !fields.symbol.trim() ? 'Latest price' : 'Fallback price'} (${fields.currency === 'GBX' ? 'p' : fields.currency})`}
          htmlFor="as-price"
          error={errors.manual_price}
          hint={fields.price_mode === 'market' && fields.symbol.trim() ? 'Used if market data is unavailable.' : 'No units? Use 1 unit and enter the total value.'}
        >
          <Input id="as-price" inputMode="decimal" value={fields.manual_price} onChange={(e) => setFields({ ...fields, manual_price: e.target.value })} placeholder="Optional" />
        </Field>
      </div>
    </div>
  );

  return { fields, reset, validate, ui };
}

export function HoldingDialog({ open, onOpenChange, holding, accountId }: { open: boolean; onOpenChange: (o: boolean) => void; holding?: Holding; accountId?: string }) {
  const { data, insert, update } = useData();
  const accounts = data.accounts.filter((a) => !a.is_archived);
  const [assetChoice, setAssetChoice] = React.useState<string>('new');
  const [form, setForm] = React.useState({ account_id: '', units: '', avg: '', notes: '' });
  const [errors, setErrors] = React.useState<Errors>({});
  const [busy, setBusy] = React.useState(false);
  const assetFields = useAssetFields();
  const existingAsset = holding ? data.assets.find((a) => a.id === holding.asset_id) : data.assets.find((a) => a.id === assetChoice);
  const hasTrades = holding ? data.transactions.some((t) => t.holding_id === holding.id && (t.type === 'buy' || t.type === 'sell')) : false;

  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    assetFields.reset();
    setAssetChoice(data.assets.length ? data.assets[0].id : 'new');
    setForm(
      holding
        ? { account_id: holding.account_id, units: String(holding.opening_units), avg: String(holding.opening_avg_cost), notes: holding.notes ?? '' }
        : { account_id: accountId ?? accounts[0]?.id ?? '', units: '', avg: '', notes: '' },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, holding]);

  const account = data.accounts.find((a) => a.id === form.account_id);
  const quoteCcy = existingAsset?.currency ?? assetFields.fields.currency;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const [units, unitsErr] = requireAmount(form.units || '0', { allowZero: true, label: 'Units' });
    const [avg, avgErr] = requireAmount(form.avg || '0', { allowZero: true, label: 'Average price' });
    let assetRow: Partial<Asset> | null = null;
    let assetErrs: Errors = {};
    if (!holding && assetChoice === 'new') [assetRow, assetErrs] = assetFields.validate();
    const duplicate = !holding && assetChoice !== 'new' && data.holdings.some((h) => h.account_id === form.account_id && h.asset_id === assetChoice);
    const errs: Errors = {
      ...assetErrs,
      account_id: form.account_id ? (duplicate ? 'Already held in this account. Edit the existing holding instead.' : null) : 'Choose an account',
      units: unitsErr,
      avg: avgErr,
    };
    setErrors(errs);
    if (hasErrors(errs)) return;
    setBusy(true);
    const position = { opening_units: Number(units), opening_avg_cost: Number(avg), notes: form.notes.trim() || null };
    let ok: unknown;
    if (holding) {
      ok = await update('holdings', holding.id, position, 'Holding updated');
    } else {
      let assetId = assetChoice;
      if (assetChoice === 'new') {
        const created = await insert('assets', { ...assetRow!, on_watchlist: false });
        if (!created) {
          setBusy(false);
          return;
        }
        assetId = created.id;
      }
      ok = await insert('holdings', { account_id: form.account_id, asset_id: assetId, ...position }, 'Holding added');
    }
    setBusy(false);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={holding ? `Edit ${existingAsset?.name ?? 'holding'}` : 'Add a holding'} description={holding ? undefined : 'A stock, ETF or fund you own inside one of your accounts.'}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Account" htmlFor="h-acc" error={errors.account_id}>
            <NativeSelect id="h-acc" value={form.account_id} disabled={!!holding} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
              {accounts.length === 0 ? <option value="">Create an account first</option> : null}
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {!holding ? (
            <Field label="Investment" htmlFor="h-asset">
              <NativeSelect id="h-asset" value={assetChoice} onChange={(e) => setAssetChoice(e.target.value)}>
                {data.assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.symbol ? ` (${a.symbol})` : ''}
                  </option>
                ))}
                <option value="new">+ New investment…</option>
              </NativeSelect>
            </Field>
          ) : null}
          {!holding && assetChoice === 'new' ? <div className="rounded-2xl border bg-muted/30 p-3">{assetFields.ui(errors)}</div> : null}

          <div className="grid grid-cols-2 gap-3">
            <Field label={hasTrades ? 'Units before recorded trades' : 'Units held'} htmlFor="h-units" error={errors.units}>
              <Input id="h-units" inputMode="decimal" value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} placeholder="0" />
            </Field>
            <Field label={`Average price (${quoteCcy === 'GBX' ? 'pence' : quoteCcy})`} htmlFor="h-avg" error={errors.avg}>
              <Input id="h-avg" inputMode="decimal" value={form.avg} onChange={(e) => setForm({ ...form, avg: e.target.value })} placeholder="0.00" />
            </Field>
          </div>
          <Notice>
            {hasTrades
              ? 'This is the starting position. Buys and sells you record are added on top.'
              : 'Enter what you hold today, or 0 and record individual buys. Both work; trades are added on top of this starting position.'}
            {account && quoteCcy !== account.currency && !(quoteCcy === 'GBX' && account.currency === 'GBP')
              ? ` Cost is converted to ${account.currency} at today's exchange rate.`
              : ''}
          </Notice>
          {account?.valuation_mode === 'snapshot' ? (
            <Notice>
              {account.name} is valued by snapshots, so this holding is shown for information and compared with the snapshot. It is not added to your total twice.
            </Notice>
          ) : null}
          <Field label="Notes" htmlFor="h-notes">
            <Textarea id="h-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <FormActions busy={busy} label={holding ? 'Save' : 'Add holding'} onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Create/edit an investment's details (watchlist, manual price). */
export function AssetDialog({ open, onOpenChange, asset, watchlist = false }: { open: boolean; onOpenChange: (o: boolean) => void; asset?: Asset; watchlist?: boolean }) {
  const { insert, update } = useData();
  const fields = useAssetFields(asset);
  const [errors, setErrors] = React.useState<Errors>({});
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      fields.reset();
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, asset]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const [row, errs] = fields.validate();
    setErrors(errs);
    if (!row) return;
    setBusy(true);
    const ok = asset ? await update('assets', asset.id, row, 'Investment updated') : await insert('assets', { ...row, on_watchlist: watchlist }, watchlist ? 'Added to watchlist' : 'Investment added');
    setBusy(false);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={asset ? `Edit ${asset.name}` : watchlist ? 'Add to watchlist' : 'Add investment'}>
        <form onSubmit={submit} noValidate>
          {fields.ui(errors)}
          <FormActions busy={busy} label={asset ? 'Save' : 'Add'} onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
