// Domain types. These mirror the Supabase tables in supabase/migrations.
// Monetary amounts are carried as numbers at the edges (Postgres numeric is
// returned as a JSON number) and all arithmetic goes through lib/money.ts,
// which uses decimal.js, so we never accumulate binary floating-point error.

export type ISODate = string; // 'YYYY-MM-DD'
export type ISODateTime = string; // full ISO 8601 timestamp

export const ACCOUNT_TYPES = [
  'stocks_shares_isa',
  'lifetime_isa',
  'cash_isa',
  'sipp',
  'workplace_pension',
  'gia',
  'cash_savings',
  'premium_bonds',
  'crypto',
  'other',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  stocks_shares_isa: 'Stocks & Shares ISA',
  lifetime_isa: 'Lifetime ISA',
  cash_isa: 'Cash ISA',
  sipp: 'SIPP',
  workplace_pension: 'Workplace pension',
  gia: 'General Investment Account',
  cash_savings: 'Cash savings',
  premium_bonds: 'Premium Bonds',
  crypto: 'Crypto',
  other: 'Other',
};

/**
 * How an account's current value is determined.
 * - snapshot: the latest manually recorded snapshot is the account value.
 * - holdings: value = sum of tracked holdings at market prices + cash balance.
 */
export type ValuationMode = 'snapshot' | 'holdings';

export interface Account {
  id: string;
  name: string;
  provider: string | null;
  account_type: AccountType;
  reference: string | null;
  currency: string;
  opened_on: ISODate | null;
  notes: string | null;
  valuation_mode: ValuationMode;
  cash_balance: number;
  is_archived: boolean;
  created_at: ISODateTime;
}

export interface Snapshot {
  id: string;
  account_id: string;
  valued_on: ISODate;
  value: number;
  notes: string | null;
  created_at: ISODateTime;
}

export const TRANSACTION_TYPES = [
  'deposit',
  'withdrawal',
  'transfer_in',
  'transfer_out',
  'buy',
  'sell',
  'dividend',
  'interest',
  'fee',
  'adjustment',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  deposit: 'Contribution',
  withdrawal: 'Withdrawal',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  buy: 'Buy',
  sell: 'Sell',
  dividend: 'Dividend',
  interest: 'Interest',
  fee: 'Fee',
  adjustment: 'Adjustment',
};

export interface Transaction {
  id: string;
  account_id: string;
  type: TransactionType;
  /** Always positive, except 'adjustment' which may be signed. */
  amount: number;
  occurred_on: ISODate;
  description: string | null;
  holding_id: string | null;
  units: number | null;
  price_per_unit: number | null;
  fees: number | null;
  /** Shared by the two legs of an internal transfer. */
  transfer_group_id: string | null;
  created_at: ISODateTime;
}

export const ASSET_TYPES = ['stock', 'etf', 'fund', 'investment_trust', 'bond', 'crypto', 'cash', 'other'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  stock: 'Stock',
  etf: 'ETF',
  fund: 'Fund',
  investment_trust: 'Investment trust',
  bond: 'Bond',
  crypto: 'Crypto',
  cash: 'Cash',
  other: 'Other',
};

/** Pricing currencies. GBX = pence sterling, used by most LSE quotes. */
export type PriceCurrency = string;

export interface Asset {
  id: string;
  name: string;
  symbol: string | null;
  exchange: string | null;
  asset_type: AssetType;
  /** Currency the price is quoted in, e.g. GBX for LSE shares, USD for NASDAQ. */
  currency: PriceCurrency;
  /** 'market' fetches from the provider; 'manual' uses manual_price only. */
  price_mode: 'market' | 'manual';
  manual_price: number | null;
  manual_price_at: ISODateTime | null;
  on_watchlist: boolean;
  created_at: ISODateTime;
}

export interface Holding {
  id: string;
  account_id: string;
  asset_id: string;
  /**
   * Opening position entered by hand (units and average cost per unit in the
   * asset's price currency). Recorded buy/sell transactions linked to this
   * holding are applied on top, so detailed trade history is optional.
   */
  opening_units: number;
  opening_avg_cost: number;
  notes: string | null;
  created_at: ISODateTime;
}

export interface MarketPrice {
  symbol: string;
  price: number;
  currency: string;
  change: number | null;
  change_pct: number | null;
  as_of: ISODateTime;
  fetched_at: ISODateTime;
  source: string;
  /** 'realtime' is never claimed by the providers we use on free tiers. */
  freshness: 'delayed' | 'end_of_day' | 'demo';
  market_open: boolean | null;
}

export interface CreditCard {
  id: string;
  name: string;
  credit_limit: number | null;
  created_at: ISODateTime;
}

export type BillStatus = 'paid' | 'unpaid';

export interface CreditCardBill {
  id: string;
  card_id: string;
  statement_date: ISODate;
  due_date: ISODate;
  amount_due: number;
  amount_paid: number;
  minimum_payment: number | null;
  status: BillStatus;
  notes: string | null;
  created_at: ISODateTime;
}

export interface Dataset {
  accounts: Account[];
  snapshots: Snapshot[];
  transactions: Transaction[];
  assets: Asset[];
  holdings: Holding[];
  cards: CreditCard[];
  bills: CreditCardBill[];
}

export const EMPTY_DATASET: Dataset = {
  accounts: [],
  snapshots: [],
  transactions: [],
  assets: [],
  holdings: [],
  cards: [],
  bills: [],
};
