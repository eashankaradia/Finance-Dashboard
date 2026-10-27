import { addDays, addMonths, todayISO } from '../dates';
import type { Account, Asset, Dataset, Holding, MarketPrice, Snapshot, Transaction } from '../types';

// Realistic but entirely fictional sample data, generated relative to today so
// charts always look current. Used only in demo mode (browser storage).

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const created = '2024-01-01T09:00:00.000Z';

let counter = 0;
function demoId(prefix: string): string {
  counter++;
  const hex = counter.toString(16).padStart(12, '0');
  const p = prefix.padEnd(8, '0').slice(0, 8).replace(/[^0-9a-f]/g, 'd');
  return `${p}-0000-4000-8000-${hex}`;
}

function monthEnd(date: string): string {
  const first = addMonths(date.slice(0, 8) + '01', 1);
  return addDays(first, -1);
}

export const DEMO_PRICE_DATA: Record<string, { price: number; currency: string; change_pct: number }> = {
  'VWRP.LON': { price: 118.34, currency: 'GBP', change_pct: 0.0042 },
  'VUSA.LON': { price: 96.18, currency: 'GBP', change_pct: 0.0061 },
  'LLOY.LON': { price: 76.42, currency: 'GBX', change_pct: -0.0083 },
  AAPL: { price: 232.5, currency: 'USD', change_pct: 0.0114 },
  MSFT: { price: 421.1, currency: 'USD', change_pct: -0.0031 },
  'TSCO.LON': { price: 381.6, currency: 'GBX', change_pct: 0.0019 },
};

export function demoPrices(now = new Date()): Record<string, MarketPrice> {
  const iso = now.toISOString();
  return Object.fromEntries(
    Object.entries(DEMO_PRICE_DATA).map(([symbol, p]) => [
      symbol,
      {
        symbol,
        price: p.price,
        currency: p.currency,
        change: round2((p.price * p.change_pct) / (1 + p.change_pct)),
        change_pct: p.change_pct,
        as_of: iso,
        fetched_at: iso,
        source: 'Demo data',
        freshness: 'demo',
        market_open: null,
      } satisfies MarketPrice,
    ]),
  );
}

export const DEMO_FX = { USD: 0.75, EUR: 0.85 };

export function buildDemoDataset(today = todayISO()): Dataset {
  counter = 0;
  const rand = rng(42);
  const accounts: Account[] = [];
  const snapshots: Snapshot[] = [];
  const transactions: Transaction[] = [];
  const assets: Asset[] = [];
  const holdings: Holding[] = [];

  const months = 30;
  const start = monthEnd(addMonths(today, -months));

  const account = (over: Partial<Account> & Pick<Account, 'name' | 'account_type'>): Account => {
    const a: Account = {
      id: demoId('acc'),
      provider: null,
      reference: null,
      currency: 'GBP',
      opened_on: addDays(start, -20),
      notes: null,
      valuation_mode: 'snapshot',
      cash_balance: 0,
      is_archived: false,
      created_at: created,
      ...over,
    };
    accounts.push(a);
    return a;
  };

  const tx = (a: Account, over: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'occurred_on'>): Transaction => {
    const t: Transaction = {
      id: demoId('tx'),
      account_id: a.id,
      description: null,
      holding_id: null,
      units: null,
      price_per_unit: null,
      fees: null,
      transfer_group_id: null,
      created_at: created,
      ...over,
    };
    transactions.push(t);
    return t;
  };

  /**
   * Simulate month-end values from monthly contributions and random returns.
   * `extraFlows` maps 'YYYY-MM' to additional net flow that month.
   */
  const simulate = (
    a: Account,
    opts: {
      opening: number;
      monthly: number;
      mean: number;
      vol: number;
      every?: number;
      desc?: string;
      extraFlows?: Record<string, number>;
      income?: { type: 'interest' | 'dividend'; rate: number; desc: string };
      scaleTo?: number;
    },
  ) => {
    let value = opts.opening;
    const points: { date: string; value: number }[] = [];
    if (opts.opening > 0) points.push({ date: start, value });
    for (let m = 1; m <= months; m++) {
      const end = monthEnd(addMonths(start, m));
      const mid = end.slice(0, 8) + '15';
      if (end > today) {
        // Current month: contribution already made, no month-end valuation yet.
        if (opts.monthly > 0 && mid <= today) tx(a, { type: 'deposit', amount: opts.monthly, occurred_on: mid, description: opts.desc ?? 'Monthly contribution' });
        break;
      }
      if (opts.monthly > 0) {
        tx(a, { type: 'deposit', amount: opts.monthly, occurred_on: mid, description: opts.desc ?? 'Monthly contribution' });
        value += opts.monthly;
      }
      const extra = opts.extraFlows?.[end.slice(0, 7)] ?? 0;
      value += extra;
      if (opts.income) {
        const inc = round2(value * opts.income.rate);
        if (inc > 0) tx(a, { type: opts.income.type, amount: inc, occurred_on: end, description: opts.income.desc });
        value += inc;
      }
      const r = opts.mean + (rand() - 0.5) * 2 * opts.vol;
      value = value * (1 + r);
      if (m % (opts.every ?? 1) === 0) points.push({ date: end, value: round2(value) });
    }
    if (opts.scaleTo && points.length) {
      const f = opts.scaleTo / points[points.length - 1].value;
      for (const p of points) p.value = round2(p.value * (1 + (f - 1) * (points.indexOf(p) / points.length)));
    }
    for (const p of points) {
      snapshots.push({ id: demoId('snap'), account_id: a.id, valued_on: p.date, value: p.value, notes: null, created_at: created });
    }
  };

  // Transfer from cash savings into the ISA four months ago.
  const transferMonth = monthEnd(addMonths(today, -4));
  const transferDate = transferMonth.slice(0, 8) + '06';

  const isa = account({ name: 'Vanguard ISA', provider: 'Vanguard', account_type: 'stocks_shares_isa', reference: 'ISA-••••4821', notes: 'Global index tracker' });
  simulate(isa, { opening: 0, monthly: 400, mean: 0.007, vol: 0.03, extraFlows: { [transferMonth.slice(0, 7)]: 2000 } });

  const gia = account({ name: 'Trading 212', provider: 'Trading 212', account_type: 'gia', valuation_mode: 'holdings', cash_balance: 118.4 });
  const withdrawalMonth = monthEnd(addMonths(today, -9));
  simulate(gia, { opening: 2500, monthly: 250, mean: 0.008, vol: 0.045, extraFlows: { [withdrawalMonth.slice(0, 7)]: -600 }, scaleTo: 9350 });
  tx(gia, { type: 'withdrawal', amount: 600, occurred_on: withdrawalMonth.slice(0, 8) + '20', description: 'Holiday fund' });

  const pension = account({ name: 'Workplace pension', provider: 'Aviva', account_type: 'workplace_pension', notes: 'Employer matches 5%' });
  simulate(pension, { opening: 18500, monthly: 520, mean: 0.0065, vol: 0.025, every: 3, desc: 'Salary sacrifice + employer' });

  const lisa = account({ name: 'Lifetime ISA', provider: 'Moneybox', account_type: 'lifetime_isa' });
  simulate(lisa, { opening: 4200, monthly: 250, mean: 0.006, vol: 0.03 });

  const bonds = account({ name: 'Premium Bonds', provider: 'NS&I', account_type: 'premium_bonds' });
  simulate(bonds, { opening: 5000, monthly: 0, mean: 0, vol: 0, every: 6, income: { type: 'interest', rate: 0.0033, desc: 'Prize' } });

  const cash = account({ name: 'Easy access saver', provider: 'Chase', account_type: 'cash_savings' });
  simulate(cash, { opening: 6000, monthly: 150, mean: 0, vol: 0, extraFlows: { [transferMonth.slice(0, 7)]: -2000 }, income: { type: 'interest', rate: 0.0035, desc: 'Interest' } });

  // Internal transfer: counts for each account but nets to zero overall.
  const group = demoId('grp');
  tx(cash, { type: 'transfer_out', amount: 2000, occurred_on: transferDate, description: 'Top up ISA', transfer_group_id: group });
  tx(isa, { type: 'transfer_in', amount: 2000, occurred_on: transferDate, description: 'Top up ISA', transfer_group_id: group });

  // Assets and holdings.
  const asset = (over: Partial<Asset> & Pick<Asset, 'name' | 'asset_type' | 'currency'>): Asset => {
    const a: Asset = {
      id: demoId('ast'),
      symbol: null,
      exchange: null,
      price_mode: 'market',
      manual_price: null,
      manual_price_at: null,
      on_watchlist: false,
      created_at: created,
      ...over,
    };
    assets.push(a);
    return a;
  };
  const holding = (acc: Account, as: Asset, units: number, avg: number): Holding => {
    const h: Holding = { id: demoId('hld'), account_id: acc.id, asset_id: as.id, opening_units: units, opening_avg_cost: avg, notes: null, created_at: created };
    holdings.push(h);
    return h;
  };

  const vwrp = asset({ name: 'Vanguard FTSE All-World UCITS ETF (Acc)', symbol: 'VWRP.LON', exchange: 'LSE', asset_type: 'etf', currency: 'GBP' });
  const ls80 = asset({
    name: 'Vanguard LifeStrategy 80% Equity Fund',
    asset_type: 'fund',
    currency: 'GBP',
    price_mode: 'manual',
    manual_price: 268.41,
    manual_price_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  });
  const vusa = asset({ name: 'Vanguard S&P 500 UCITS ETF', symbol: 'VUSA.LON', exchange: 'LSE', asset_type: 'etf', currency: 'GBP' });
  const lloy = asset({ name: 'Lloyds Banking Group plc', symbol: 'LLOY.LON', exchange: 'LSE', asset_type: 'stock', currency: 'GBX' });
  const aapl = asset({ name: 'Apple Inc.', symbol: 'AAPL', exchange: 'NASDAQ', asset_type: 'stock', currency: 'USD' });
  asset({ name: 'Microsoft Corp.', symbol: 'MSFT', exchange: 'NASDAQ', asset_type: 'stock', currency: 'USD', on_watchlist: true });
  asset({ name: 'Tesco plc', symbol: 'TSCO.LON', exchange: 'LSE', asset_type: 'stock', currency: 'GBX', on_watchlist: true });

  // ISA is snapshot-valued; its holdings are tracked for information and
  // compared against the latest snapshot (never added on top of it).
  holding(isa, vwrp, 72, 98.5);
  holding(isa, ls80, 21.4, 231.2);

  // GIA is valued from holdings + cash.
  const hVusa = holding(gia, vusa, 25, 70.1);
  const hLloy = holding(gia, lloy, 0, 0);
  holding(gia, aapl, 12, 171.2);
  const buy = (h: Holding, date: string, units: number, price: number, inPence = false) => {
    const amount = round2(inPence ? (units * price) / 100 : units * price);
    tx(gia, { type: 'buy', amount, occurred_on: date, holding_id: h.id, units, price_per_unit: price, fees: 0, description: null });
  };
  buy(hVusa, addMonths(today, -14), 10, 81.2);
  buy(hVusa, addMonths(today, -5), 8, 90.05);
  buy(hLloy, addMonths(today, -20), 3000, 47.8, true);
  buy(hLloy, addMonths(today, -8), 2000, 58.3, true);
  tx(gia, { type: 'sell', amount: 470.4, occurred_on: addMonths(today, -3), holding_id: hLloy.id, units: 800, price_per_unit: 58.8, fees: 0, description: 'Trimmed position' });
  tx(gia, { type: 'dividend', amount: 64.12, occurred_on: addMonths(today, -6), holding_id: hLloy.id, description: 'Interim dividend' });
  tx(gia, { type: 'dividend', amount: 21.4, occurred_on: addMonths(today, -2), holding_id: hVusa.id, description: 'Quarterly distribution' });
  tx(gia, { type: 'fee', amount: 4.99, occurred_on: addMonths(today, -1), description: 'FX fee' });

  return { accounts, snapshots, transactions, assets, holdings, ...demoCards(today) };
}

function demoCards(today: string): Pick<Dataset, 'cards' | 'bills'> {
  const amex = { id: demoId('card'), name: 'American Express', credit_limit: 5000, created_at: created };
  const lloyds = { id: demoId('card'), name: 'Lloyds Platinum', credit_limit: 2000, created_at: created };
  const bills: Dataset['bills'] = [];
  const amounts = [[612.45, 188.3], [534.2, 220.3], [489.7, 165.75], [452.4, 285.6]];
  amounts.forEach(([a, l], i) => {
    const statement = addMonths(today, -(amounts.length - 1 - i)).slice(0, 8) + '01';
    const due = addDays(statement, 25);
    const paid = due < today;
    bills.push({ id: demoId('bill'), card_id: amex.id, statement_date: statement, due_date: due, amount_due: a, amount_paid: paid ? a : 0, minimum_payment: 25, status: paid ? 'paid' : 'unpaid', notes: null, created_at: created });
    bills.push({ id: demoId('bill'), card_id: lloyds.id, statement_date: addDays(statement, 4), due_date: addDays(due, 4), amount_due: l, amount_paid: paid ? l : 0, minimum_payment: 25, status: paid ? 'paid' : 'unpaid', notes: null, created_at: created });
  });
  return { cards: [amex, lloyds], bills };
}
