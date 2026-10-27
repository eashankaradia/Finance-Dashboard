-- Finance Dashboard: initial schema
-- Apply with `supabase db push` or paste into the Supabase SQL editor.
--
-- Design notes
-- * Every user-owned row carries user_id (defaults to auth.uid()) and Row
--   Level Security restricts all access to the owner.
-- * Child tables reference their parent with a composite (id, user_id) key,
--   so a row can never point at another user's account or holding.
-- * Money is numeric(18,2); unit quantities and prices are numeric(24,8).
--   Never float.
-- * Valuation and transaction dates are DATE (calendar days, no time zone);
--   audit timestamps are timestamptz (UTC).

create extension if not exists pgcrypto;

-- ─── Helpers ────────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── Profiles ───────────────────────────────────────────────────────────────

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  base_currency char(3) not null default 'GBP',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Accounts ───────────────────────────────────────────────────────────────

create table public.accounts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name           text not null check (length(trim(name)) between 1 and 120),
  provider       text check (provider is null or length(provider) <= 120),
  account_type   text not null check (account_type in (
                   'stocks_shares_isa', 'lifetime_isa', 'cash_isa', 'sipp', 'workplace_pension',
                   'gia', 'cash_savings', 'premium_bonds', 'crypto', 'other')),
  reference      text check (reference is null or length(reference) <= 120),
  currency       char(3) not null default 'GBP',
  opened_on      date,
  notes          text,
  -- 'snapshot': value = latest manual snapshot. 'holdings': value = holdings at market + cash_balance.
  valuation_mode text not null default 'snapshot' check (valuation_mode in ('snapshot', 'holdings')),
  cash_balance   numeric(18, 2) not null default 0,
  is_archived    boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, user_id)
);

create index accounts_user_idx on public.accounts (user_id);
create trigger accounts_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();

-- ─── Account value snapshots ───────────────────────────────────────────────
-- Append-only by design: adding a snapshot never overwrites an older one.
-- Several snapshots on the same date are allowed; the most recently created
-- one is used for that date.

create table public.account_snapshots (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null,
  valued_on  date not null,
  value      numeric(18, 2) not null check (value >= 0),
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade
);

create index account_snapshots_account_date_idx on public.account_snapshots (account_id, valued_on);
create index account_snapshots_user_idx on public.account_snapshots (user_id);
create trigger account_snapshots_updated_at before update on public.account_snapshots
  for each row execute function public.set_updated_at();

-- ─── Assets (instrument metadata, watchlist) ───────────────────────────────

create table public.assets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (length(trim(name)) between 1 and 200),
  -- Provider symbol, e.g. 'VUSA.LON' (LSE) or 'AAPL' (US). Null for unlisted funds.
  symbol          text check (symbol is null or symbol ~ '^[A-Za-z0-9.\-:^=]{1,32}$'),
  exchange        text,
  asset_type      text not null default 'stock' check (asset_type in (
                    'stock', 'etf', 'fund', 'investment_trust', 'bond', 'crypto', 'cash', 'other')),
  -- Quote currency. GBX = pence (most LSE quotes).
  currency        text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  price_mode      text not null default 'market' check (price_mode in ('market', 'manual')),
  manual_price    numeric(24, 8) check (manual_price is null or manual_price >= 0),
  manual_price_at timestamptz,
  on_watchlist    boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id)
);

create index assets_user_idx on public.assets (user_id);
create unique index assets_user_symbol_uidx on public.assets (user_id, upper(symbol)) where symbol is not null;
create trigger assets_updated_at before update on public.assets
  for each row execute function public.set_updated_at();

-- ─── Holdings ───────────────────────────────────────────────────────────────
-- One row per (account, asset). The same asset can be held in many accounts.
-- opening_units / opening_avg_cost let you record a position without its
-- full trade history; linked buy/sell transactions are applied on top.

create table public.holdings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id       uuid not null,
  asset_id         uuid not null,
  opening_units    numeric(24, 8) not null default 0 check (opening_units >= 0),
  opening_avg_cost numeric(24, 8) not null default 0 check (opening_avg_cost >= 0),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id),
  unique (account_id, asset_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  foreign key (asset_id, user_id) references public.assets (id, user_id) on delete restrict
);

create index holdings_user_idx on public.holdings (user_id);
create index holdings_asset_idx on public.holdings (asset_id);
create trigger holdings_updated_at before update on public.holdings
  for each row execute function public.set_updated_at();

-- ─── Transactions ───────────────────────────────────────────────────────────
-- amount is the cash value in the account's currency, always positive except
-- for 'adjustment' (signed). Direction comes from the type.
-- Only deposit/withdrawal are external flows for the portfolio. Transfers are
-- stored as two legs sharing transfer_group_id and cancel out in totals.

create table public.transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id        uuid not null,
  type              text not null check (type in (
                      'deposit', 'withdrawal', 'transfer_in', 'transfer_out',
                      'buy', 'sell', 'dividend', 'interest', 'fee', 'adjustment')),
  amount            numeric(18, 2) not null,
  occurred_on       date not null,
  description       text check (description is null or length(description) <= 500),
  holding_id        uuid,
  units             numeric(24, 8) check (units is null or units > 0),
  price_per_unit    numeric(24, 8) check (price_per_unit is null or price_per_unit >= 0),
  fees              numeric(18, 2) check (fees is null or fees >= 0),
  transfer_group_id uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  foreign key (holding_id, user_id) references public.holdings (id, user_id) on delete set null (holding_id),
  constraint amount_sign check ((type = 'adjustment' and amount <> 0) or (type <> 'adjustment' and amount > 0)),
  constraint trade_units check (type not in ('buy', 'sell') or holding_id is null or units is not null),
  constraint transfer_group check ((type in ('transfer_in', 'transfer_out')) = (transfer_group_id is not null))
);

create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc);
create index transactions_account_date_idx on public.transactions (account_id, occurred_on);
create index transactions_holding_idx on public.transactions (holding_id) where holding_id is not null;
create index transactions_transfer_idx on public.transactions (transfer_group_id) where transfer_group_id is not null;
create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

-- Create both legs of an internal transfer atomically.
create or replace function public.create_transfer(
  p_from_account uuid,
  p_to_account uuid,
  p_amount numeric,
  p_occurred_on date,
  p_description text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_group uuid := gen_random_uuid();
begin
  if p_from_account = p_to_account then
    raise exception 'Choose two different accounts';
  end if;
  insert into public.transactions (account_id, type, amount, occurred_on, description, transfer_group_id)
  values
    (p_from_account, 'transfer_out', p_amount, p_occurred_on, p_description, v_group),
    (p_to_account,   'transfer_in',  p_amount, p_occurred_on, p_description, v_group);
  return v_group;
end;
$$;

-- ─── Market prices (shared cache, written only by the server) ──────────────

create table public.market_prices (
  symbol      text primary key,
  price       numeric(24, 8) not null check (price >= 0),
  currency    text not null,
  change      numeric(24, 8),
  change_pct  numeric(12, 6),
  as_of       timestamptz not null,
  fetched_at  timestamptz not null default now(),
  source      text not null,
  freshness   text not null check (freshness in ('delayed', 'end_of_day', 'demo')),
  market_open boolean
);

create table public.fx_rates (
  currency   text primary key,
  rate_gbp   numeric(24, 10) not null check (rate_gbp > 0),
  as_of      date not null,
  fetched_at timestamptz not null default now()
);

-- ─── Credit cards (carried over from the previous version of the app) ──────

create table public.credit_cards (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 120),
  credit_limit numeric(18, 2) check (credit_limit is null or credit_limit >= 0),
  created_at   timestamptz not null default now(),
  unique (id, user_id)
);

create table public.credit_card_bills (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id         uuid not null,
  statement_date  date not null,
  due_date        date not null,
  amount_due      numeric(18, 2) not null check (amount_due >= 0),
  amount_paid     numeric(18, 2) not null default 0 check (amount_paid >= 0),
  minimum_payment numeric(18, 2) check (minimum_payment is null or minimum_payment >= 0),
  status          text not null default 'unpaid' check (status in ('paid', 'unpaid')),
  notes           text,
  created_at      timestamptz not null default now(),
  foreign key (card_id, user_id) references public.credit_cards (id, user_id) on delete cascade
);

create index credit_cards_user_idx on public.credit_cards (user_id);
create index credit_card_bills_card_idx on public.credit_card_bills (card_id, due_date);

-- ─── Row Level Security ────────────────────────────────────────────────────

alter table public.profiles          enable row level security;
alter table public.accounts          enable row level security;
alter table public.account_snapshots enable row level security;
alter table public.assets            enable row level security;
alter table public.holdings          enable row level security;
alter table public.transactions      enable row level security;
alter table public.market_prices     enable row level security;
alter table public.fx_rates          enable row level security;
alter table public.credit_cards      enable row level security;
alter table public.credit_card_bills enable row level security;

create policy "own profile: read"   on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "own profile: update" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'account_snapshots', 'assets', 'holdings', 'transactions', 'credit_cards', 'credit_card_bills']
  loop
    execute format('create policy "own rows: select" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows: insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows: update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows: delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;

-- Prices and FX rates are public market data: signed-in users may read them,
-- only the server (service role, which bypasses RLS) may write them.
create policy "prices: read" on public.market_prices for select to authenticated using (true);
create policy "fx: read"     on public.fx_rates      for select to authenticated using (true);

revoke execute on function public.create_transfer(uuid, uuid, numeric, date, text) from anon, public;
grant execute on function public.create_transfer(uuid, uuid, numeric, date, text) to authenticated;
