-- Daily closing prices, one row per symbol per day. Filled by the daily job
-- (/api/cron/daily) and used for each holding's performance chart.
-- Market data like market_prices: signed-in users read, only the server
-- (service role) writes.

create table finance.price_history (
  symbol     text not null,
  price_date date not null,
  close      numeric(24, 8) not null check (close >= 0),
  source     text not null,
  fetched_at timestamptz not null default now(),
  primary key (symbol, price_date)
);

alter table finance.price_history enable row level security;

create policy "price history: read" on finance.price_history for select to authenticated using (true);

grant select on finance.price_history to authenticated;
grant select, insert, update, delete on finance.price_history to service_role;
