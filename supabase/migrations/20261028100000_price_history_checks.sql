-- When the daily job last asked a provider for history older than what is
-- stored, so it retries at most monthly (free plans only give one year).
create table if not exists finance.price_history_checks (
  symbol text primary key,
  checked_at timestamptz not null default now(),
  earliest date,
  result text
);

alter table finance.price_history_checks enable row level security;
create policy "price history checks: read" on finance.price_history_checks for select to authenticated using (true);
grant select on finance.price_history_checks to authenticated;
grant select, insert, update, delete on finance.price_history_checks to service_role;
