import { D, Decimal } from '../money';
import type { Account, Asset, Holding, MarketPrice, Transaction } from '../types';
import { convert, type FxRates } from './fx';

/**
 * Holding position maths (average cost method).
 *
 * - The opening position (units + average cost per unit, in the asset's quote
 *   currency) is entered by hand and needs no trade history.
 * - Recorded buy/sell transactions linked to the holding are applied on top
 *   in date order. A transaction's `amount` is the cash value in the
 *   account's currency, excluding fees; `fees` are added to the cost of buys
 *   and deducted from the proceeds of sells.
 * - Cost basis is held in the account's currency. Sells reduce it at the
 *   running average cost; the difference to net proceeds is realised gain.
 */

export type PriceSource = 'market' | 'manual' | 'cost' | 'none';

export interface ResolvedPrice {
  price: number | null;
  currency: string;
  source: PriceSource;
  asOf: string | null;
  freshness: MarketPrice['freshness'] | 'manual' | null;
  marketOpen: boolean | null;
  change_pct: number | null;
}

export function resolvePrice(asset: Asset, market: MarketPrice | undefined): ResolvedPrice {
  const manual: ResolvedPrice | null =
    asset.manual_price != null
      ? {
          price: asset.manual_price,
          currency: asset.currency,
          source: 'manual',
          asOf: asset.manual_price_at,
          freshness: 'manual',
          marketOpen: null,
          change_pct: null,
        }
      : null;

  if (asset.price_mode === 'manual' || !asset.symbol) {
    return manual ?? { price: null, currency: asset.currency, source: 'none', asOf: null, freshness: null, marketOpen: null, change_pct: null };
  }
  if (market) {
    // A manual price entered after the latest market quote wins (e.g. you
    // corrected a bad quote).
    if (manual?.asOf && new Date(manual.asOf) > new Date(market.as_of)) return manual;
    return {
      price: market.price,
      currency: market.currency,
      source: 'market',
      asOf: market.as_of,
      freshness: market.freshness,
      marketOpen: market.market_open,
      change_pct: market.change_pct,
    };
  }
  return manual ?? { price: null, currency: asset.currency, source: 'none', asOf: null, freshness: null, marketOpen: null, change_pct: null };
}

export interface HoldingPosition {
  holding: Holding;
  asset: Asset;
  account: Account;
  units: number;
  /** Average cost per unit in the asset's quote currency (approximate if FX applies). */
  avgCost: number | null;
  /** Cost basis of units still held, in account currency. */
  costBasis: number;
  price: ResolvedPrice;
  /** Market value in account currency; null when no price is known. */
  marketValue: number | null;
  /** Value used in totals: market value, or cost basis if no price. */
  valueForTotals: number;
  unrealisedGain: number | null;
  unrealisedReturn: number | null;
  realisedGain: number;
  dividends: number;
  fees: number;
  hasTrades: boolean;
  warnings: string[];
}

export function computeHoldingPosition(
  holding: Holding,
  asset: Asset,
  account: Account,
  transactions: Transaction[],
  market: MarketPrice | undefined,
  rates: FxRates,
): HoldingPosition {
  const warnings: string[] = [];
  const toAccount = (amount: Decimal, from: string): Decimal => {
    const c = convert(amount, from, account.currency, rates);
    if (c == null) {
      warnings.push(`No ${from}→${account.currency} exchange rate; values shown unconverted.`);
      return amount;
    }
    return c;
  };

  let units = D(holding.opening_units);
  let cost = toAccount(D(holding.opening_units).times(D(holding.opening_avg_cost)), asset.currency);
  let realised = new Decimal(0);
  let dividends = new Decimal(0);
  let fees = new Decimal(0);

  const linked = transactions
    .filter((t) => t.holding_id === holding.id)
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.created_at.localeCompare(b.created_at));

  for (const tx of linked) {
    const txFees = D(tx.fees);
    fees = fees.plus(txFees);
    if (tx.type === 'buy') {
      units = units.plus(D(tx.units));
      cost = cost.plus(D(tx.amount)).plus(txFees);
    } else if (tx.type === 'sell') {
      const sold = D(tx.units);
      const avg = units.isZero() ? new Decimal(0) : cost.dividedBy(units);
      const costOfSold = avg.times(sold);
      if (sold.greaterThan(units)) warnings.push('More units sold than held; check the trade history.');
      realised = realised.plus(D(tx.amount).minus(txFees).minus(costOfSold));
      units = units.minus(sold);
      cost = cost.minus(costOfSold);
      if (units.lessThanOrEqualTo(0)) {
        units = new Decimal(0);
        cost = new Decimal(0);
      }
    } else if (tx.type === 'dividend') {
      dividends = dividends.plus(D(tx.amount));
    } else if (tx.type === 'fee') {
      fees = fees.plus(D(tx.amount));
    }
  }

  const price = resolvePrice(asset, market);
  let marketValue: Decimal | null = null;
  if (price.price != null) marketValue = toAccount(units.times(D(price.price)), price.currency);
  if (price.price == null && units.greaterThan(0)) warnings.push('No price available; valued at cost.');

  const avgCostAccount = units.isZero() ? null : cost.dividedBy(units);
  const avgCostQuote = avgCostAccount ? convert(avgCostAccount, account.currency, asset.currency, rates) : null;
  const unrealised = marketValue ? marketValue.minus(cost) : null;

  return {
    holding,
    asset,
    account,
    units: units.toNumber(),
    avgCost: avgCostQuote ? avgCostQuote.toDecimalPlaces(6).toNumber() : null,
    costBasis: cost.toDecimalPlaces(2).toNumber(),
    price,
    marketValue: marketValue ? marketValue.toDecimalPlaces(2).toNumber() : null,
    valueForTotals: (marketValue ?? cost).toDecimalPlaces(2).toNumber(),
    unrealisedGain: unrealised ? unrealised.toDecimalPlaces(2).toNumber() : null,
    unrealisedReturn: unrealised && !cost.isZero() ? unrealised.dividedBy(cost).toNumber() : null,
    realisedGain: realised.toDecimalPlaces(2).toNumber(),
    dividends: dividends.toDecimalPlaces(2).toNumber(),
    fees: fees.toDecimalPlaces(2).toNumber(),
    hasTrades: linked.some((t) => t.type === 'buy' || t.type === 'sell'),
    warnings: [...new Set(warnings)],
  };
}
