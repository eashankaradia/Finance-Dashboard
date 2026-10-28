import type { Db } from '@/lib/supabase/types';
import type { Dataset, ISODate, MarketPrice } from '../types';
import { EMPTY_DATASET } from '../types';
import { buildDemoDataset } from './demo';
import { uid } from '../utils';

/** Dataset keys map 1:1 to database tables. */
export type Collection = keyof Dataset;

export const TABLES: Record<Collection, string> = {
  accounts: 'accounts',
  snapshots: 'account_snapshots',
  transactions: 'transactions',
  assets: 'assets',
  holdings: 'holdings',
  cards: 'credit_cards',
  bills: 'credit_card_bills',
};

export type Row<C extends Collection> = Dataset[C][number];

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  occurredOn: ISODate;
  description: string | null;
}

export interface Repository {
  mode: 'supabase' | 'demo';
  load(): Promise<Dataset>;
  loadCachedPrices(symbols: string[]): Promise<Record<string, MarketPrice>>;
  insert<C extends Collection>(collection: C, row: Partial<Row<C>>): Promise<Row<C>>;
  update<C extends Collection>(collection: C, id: string, patch: Partial<Row<C>>): Promise<void>;
  remove(collection: Collection, id: string): Promise<void>;
  removeTransferGroup(groupId: string): Promise<void>;
  createTransfer(input: TransferInput): Promise<void>;
  /** Demo only: wipe and re-seed. */
  reset?(): Promise<void>;
}

// Postgres numeric columns can arrive as strings depending on precision;
// normalise them to numbers at the edge.
const NUMERIC_FIELDS = new Set([
  'value',
  'amount',
  'units',
  'price_per_unit',
  'fees',
  'cash_balance',
  'opening_units',
  'opening_avg_cost',
  'manual_price',
  'credit_limit',
  'amount_due',
  'amount_paid',
  'minimum_payment',
  'price',
  'change',
  'change_pct',
  'close',
  'platform_fee_pct',
  'ongoing_charge_pct',
]);

export function normaliseRow<T>(row: T): T {
  const out = { ...row } as Record<string, unknown>;
  for (const [k, v] of Object.entries(out)) {
    if (NUMERIC_FIELDS.has(k) && typeof v === 'string') out[k] = Number(v);
  }
  return out as T;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export class SupabaseRepository implements Repository {
  mode = 'supabase' as const;
  constructor(private db: Db) {}

  async load(): Promise<Dataset> {
    const entries = await Promise.all(
      (Object.keys(TABLES) as Collection[]).map(async (c) => {
        const { data, error } = await this.db.from(TABLES[c]).select('*').order('created_at');
        fail(error);
        return [c, (data ?? []).map(normaliseRow)] as const;
      }),
    );
    return Object.fromEntries(entries) as unknown as Dataset;
  }

  async loadCachedPrices(symbols: string[]): Promise<Record<string, MarketPrice>> {
    if (symbols.length === 0) return {};
    const { data, error } = await this.db.from('market_prices').select('*').in('symbol', symbols);
    if (error) return {};
    return Object.fromEntries((data ?? []).map((p) => [p.symbol, normaliseRow(p) as MarketPrice]));
  }

  async insert<C extends Collection>(collection: C, row: Partial<Row<C>>): Promise<Row<C>> {
    const { data, error } = await this.db.from(TABLES[collection]).insert(row as Record<string, unknown>).select().single();
    fail(error);
    return normaliseRow(data) as Row<C>;
  }

  async update<C extends Collection>(collection: C, id: string, patch: Partial<Row<C>>): Promise<void> {
    const { error } = await this.db.from(TABLES[collection]).update(patch as Record<string, unknown>).eq('id', id);
    fail(error);
  }

  async remove(collection: Collection, id: string): Promise<void> {
    const { error } = await this.db.from(TABLES[collection]).delete().eq('id', id);
    fail(error);
  }

  async removeTransferGroup(groupId: string): Promise<void> {
    const { error } = await this.db.from('transactions').delete().eq('transfer_group_id', groupId);
    fail(error);
  }

  async createTransfer(input: TransferInput): Promise<void> {
    const { error } = await this.db.rpc('create_transfer', {
      p_from_account: input.fromAccountId,
      p_to_account: input.toAccountId,
      p_amount: input.amount,
      p_occurred_on: input.occurredOn,
      p_description: input.description,
    });
    fail(error);
  }
}

const STORAGE_KEY = 'fd-demo-dataset-v1';

/**
 * Demo repository: sample data kept only in this browser's localStorage.
 * It never touches the database, so demo records cannot mix with real ones.
 */
export class LocalDemoRepository implements Repository {
  mode = 'demo' as const;
  private data: Dataset | null = null;

  private read(): Dataset {
    if (this.data) return this.data;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.data = { ...EMPTY_DATASET, ...JSON.parse(raw) } as Dataset;
    } catch {
      // Storage blocked (private mode etc.): fall back to in-memory data.
    }
    if (!this.data) {
      this.data = buildDemoDataset();
      this.persist();
    }
    return this.data;
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // ignore: demo still works in memory
    }
  }

  async load(): Promise<Dataset> {
    return structuredClone(this.read());
  }

  async loadCachedPrices(): Promise<Record<string, MarketPrice>> {
    return {};
  }

  async insert<C extends Collection>(collection: C, row: Partial<Row<C>>): Promise<Row<C>> {
    const data = this.read();
    const full = { id: uid(), created_at: new Date().toISOString(), ...row } as Row<C>;
    (data[collection] as Row<C>[]).push(full);
    this.persist();
    return full;
  }

  async update<C extends Collection>(collection: C, id: string, patch: Partial<Row<C>>): Promise<void> {
    const data = this.read();
    const list = data[collection] as Row<C>[];
    const i = list.findIndex((r) => r.id === id);
    if (i < 0) throw new Error('Record not found');
    list[i] = { ...list[i], ...patch };
    this.persist();
  }

  async remove(collection: Collection, id: string): Promise<void> {
    const data = this.read();
    (data[collection] as { id: string }[]) = (data[collection] as { id: string }[]).filter((r) => r.id !== id);
    // Mirror the database's cascades.
    if (collection === 'accounts') {
      data.snapshots = data.snapshots.filter((s) => s.account_id !== id);
      data.transactions = data.transactions.filter((t) => t.account_id !== id);
      data.holdings = data.holdings.filter((h) => h.account_id !== id);
    }
    if (collection === 'holdings') {
      data.transactions = data.transactions.map((t) => (t.holding_id === id ? { ...t, holding_id: null } : t));
    }
    if (collection === 'cards') data.bills = data.bills.filter((b) => b.card_id !== id);
    this.persist();
  }

  async removeTransferGroup(groupId: string): Promise<void> {
    const data = this.read();
    data.transactions = data.transactions.filter((t) => t.transfer_group_id !== groupId);
    this.persist();
  }

  async createTransfer(input: TransferInput): Promise<void> {
    if (input.fromAccountId === input.toAccountId) throw new Error('Choose two different accounts');
    const group = uid();
    const base = {
      amount: Number(input.amount),
      occurred_on: input.occurredOn,
      description: input.description,
      holding_id: null,
      units: null,
      price_per_unit: null,
      fees: null,
      transfer_group_id: group,
    };
    await this.insert('transactions', { ...base, account_id: input.fromAccountId, type: 'transfer_out' });
    await this.insert('transactions', { ...base, account_id: input.toAccountId, type: 'transfer_in' });
  }

  async reset(): Promise<void> {
    this.data = buildDemoDataset();
    this.persist();
  }
}
