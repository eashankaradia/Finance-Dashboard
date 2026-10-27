import type { Account, Asset, Dataset, Holding, Snapshot, Transaction, TransactionType } from '../../types';
import { EMPTY_DATASET } from '../../types';

let n = 0;
const id = (p: string) => `${p}-${++n}`;
const ts = '2020-01-01T00:00:00Z';

export function account(over: Partial<Account> = {}): Account {
  return {
    id: id('acc'),
    name: 'ISA',
    provider: null,
    account_type: 'stocks_shares_isa',
    reference: null,
    currency: 'GBP',
    opened_on: null,
    notes: null,
    valuation_mode: 'snapshot',
    cash_balance: 0,
    is_archived: false,
    created_at: ts,
    ...over,
  };
}

export function snap(account_id: string, valued_on: string, value: number, created_at = ts): Snapshot {
  return { id: id('snap'), account_id, valued_on, value, notes: null, created_at };
}

export function tx(account_id: string, type: TransactionType, occurred_on: string, amount: number, over: Partial<Transaction> = {}): Transaction {
  return {
    id: id('tx'),
    account_id,
    type,
    amount,
    occurred_on,
    description: null,
    holding_id: null,
    units: null,
    price_per_unit: null,
    fees: null,
    transfer_group_id: null,
    created_at: ts,
    ...over,
  };
}

export function asset(over: Partial<Asset> = {}): Asset {
  return {
    id: id('asset'),
    name: 'Test plc',
    symbol: 'TEST.LON',
    exchange: 'LSE',
    asset_type: 'stock',
    currency: 'GBX',
    price_mode: 'market',
    manual_price: null,
    manual_price_at: null,
    on_watchlist: false,
    created_at: ts,
    ...over,
  };
}

export function holding(account_id: string, asset_id: string, opening_units: number, opening_avg_cost: number): Holding {
  return { id: id('hold'), account_id, asset_id, opening_units, opening_avg_cost, notes: null, created_at: ts };
}

export function dataset(over: Partial<Dataset>): Dataset {
  return { ...EMPTY_DATASET, ...over };
}
