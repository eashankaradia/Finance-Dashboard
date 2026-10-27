-- Market data API calls made by the app, per provider per UTC day, so the UI
-- can show how many free requests are left today. Shared across users because
-- the API keys are shared. Readable when signed in; written only by the server.

create table finance.api_usage (
  provider   text not null,
  usage_date date not null,
  calls      integer not null default 0 check (calls >= 0),
  primary key (provider, usage_date)
);

alter table finance.api_usage enable row level security;

create policy "api usage: read" on finance.api_usage for select to authenticated using (true);

grant select on finance.api_usage to authenticated;
grant select, insert, update, delete on finance.api_usage to service_role;

-- Atomically add calls for today (UTC); returns today's total.
create or replace function finance.record_api_calls(p_provider text, p_count integer)
returns integer
language sql
security invoker
set search_path = ''
as $$
  insert into finance.api_usage (provider, usage_date, calls)
  values (p_provider, (now() at time zone 'utc')::date, p_count)
  on conflict (provider, usage_date) do update set calls = finance.api_usage.calls + excluded.calls
  returning calls;
$$;

revoke execute on function finance.record_api_calls(text, integer) from anon, authenticated, public;
grant execute on function finance.record_api_calls(text, integer) to service_role;
