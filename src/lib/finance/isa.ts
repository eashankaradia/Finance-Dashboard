import { addDays, daysBetween } from '../dates';
import { D, Decimal } from '../money';
import type { Account, AccountType, Dataset, ISODate, Transaction } from '../types';

/**
 * ISA allowance tracker (UK tax year 6 April – 5 April).
 *
 * - Subscriptions = contributions (deposits) into ISA accounts, plus internal
 *   transfers into an ISA from a non-ISA account (e.g. "Bed & ISA" or moving
 *   savings in). Transfers between ISAs and transfers in from another
 *   provider with no recorded source leg don't use the allowance.
 * - Lifetime ISA payments count towards the overall £20,000 and have their
 *   own £4,000 limit. The 25% government bonus isn't a subscription, so it
 *   shouldn't be recorded as a contribution.
 * - Withdrawals don't give allowance back (flexible ISAs can, but this is
 *   the conservative reading).
 */

export const ISA_ALLOWANCE = 20_000;
export const LISA_LIMIT = 4_000;
export const ISA_TYPES: readonly AccountType[] = ['stocks_shares_isa', 'cash_isa', 'lifetime_isa'];

export const isIsa = (a: Pick<Account, 'account_type'>) => ISA_TYPES.includes(a.account_type);

export interface TaxYear {
  start: ISODate;
  end: ISODate;
  /** e.g. "2026/27" */
  label: string;
}

export function taxYearOf(date: ISODate): TaxYear {
  const y = Number(date.slice(0, 4));
  const startYear = date.slice(5) >= '04-06' ? y : y - 1;
  return {
    start: `${startYear}-04-06`,
    end: `${startYear + 1}-04-05`,
    label: `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`,
  };
}

export interface IsaSubscription {
  tx: Transaction;
  account: Account;
  amount: number;
}

export interface IsaYearSummary {
  year: TaxYear;
  used: number;
  remaining: number;
  over: number;
  lisaUsed: number;
  lisaOver: number;
  byAccount: { account: Account; amount: number }[];
  subscriptions: IsaSubscription[];
}

export interface IsaAllowance {
  current: IsaYearSummary;
  daysLeft: number;
  /** Whole and part months left in the tax year, at least 1. */
  monthsLeft: number;
  /** Monthly amount to use the rest of the allowance by 5 April. */
  monthlyToMax: number;
  hasIsa: boolean;
  history: IsaYearSummary[];
}

/** Transactions that use ISA allowance, with the account they went into. */
export function isaSubscriptions(data: Dataset): IsaSubscription[] {
  const accounts = new Map(data.accounts.map((a) => [a.id, a]));
  const outLegs = new Map<string, Transaction>();
  for (const t of data.transactions) if (t.type === 'transfer_out' && t.transfer_group_id) outLegs.set(t.transfer_group_id, t);

  const out: IsaSubscription[] = [];
  for (const t of data.transactions) {
    const account = accounts.get(t.account_id);
    if (!account || !isIsa(account)) continue;
    let counts = t.type === 'deposit';
    if (t.type === 'transfer_in' && t.transfer_group_id) {
      const from = accounts.get(outLegs.get(t.transfer_group_id)?.account_id ?? '');
      counts = !!from && !isIsa(from);
    }
    if (counts && t.amount > 0) out.push({ tx: t, account, amount: t.amount });
  }
  return out.sort((a, b) => b.tx.occurred_on.localeCompare(a.tx.occurred_on));
}

function summarise(year: TaxYear, subs: IsaSubscription[]): IsaYearSummary {
  const inYear = subs.filter((s) => s.tx.occurred_on >= year.start && s.tx.occurred_on <= year.end);
  const byAccount = new Map<string, { account: Account; amount: Decimal }>();
  let used = new Decimal(0);
  let lisa = new Decimal(0);
  for (const s of inYear) {
    used = used.plus(D(s.amount));
    if (s.account.account_type === 'lifetime_isa') lisa = lisa.plus(D(s.amount));
    const row = byAccount.get(s.account.id) ?? { account: s.account, amount: new Decimal(0) };
    row.amount = row.amount.plus(D(s.amount));
    byAccount.set(s.account.id, row);
  }
  const u = used.toDecimalPlaces(2).toNumber();
  const l = lisa.toDecimalPlaces(2).toNumber();
  return {
    year,
    used: u,
    remaining: Math.max(0, ISA_ALLOWANCE - u),
    over: Math.max(0, u - ISA_ALLOWANCE),
    lisaUsed: l,
    lisaOver: Math.max(0, l - LISA_LIMIT),
    byAccount: [...byAccount.values()].map((r) => ({ account: r.account, amount: r.amount.toDecimalPlaces(2).toNumber() })).sort((a, b) => b.amount - a.amount),
    subscriptions: inYear,
  };
}

export function isaAllowance(data: Dataset, today: ISODate): IsaAllowance {
  const subs = isaSubscriptions(data);
  const year = taxYearOf(today);
  const current = summarise(year, subs);
  const daysLeft = daysBetween(today, year.end) + 1;

  // Count the current month as one if there's still a 6th-ish to pay on.
  let monthsLeft = 0;
  for (let d = today; d <= year.end; d = addDays(d, 1)) if (d === today || d.slice(8) === '06') monthsLeft++;
  monthsLeft = Math.max(1, Math.min(12, monthsLeft));

  const earlier = new Map<string, TaxYear>();
  for (const s of subs) {
    const y = taxYearOf(s.tx.occurred_on);
    if (y.start < year.start) earlier.set(y.label, y);
  }
  const history = [...earlier.values()].sort((a, b) => b.start.localeCompare(a.start)).map((y) => summarise(y, subs));

  return {
    current,
    daysLeft,
    monthsLeft,
    monthlyToMax: Math.ceil((current.remaining / monthsLeft) * 100) / 100,
    hasIsa: data.accounts.some((a) => isIsa(a) && !a.is_archived),
    history,
  };
}
