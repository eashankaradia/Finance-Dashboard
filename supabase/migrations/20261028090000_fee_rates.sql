-- Optional fee rates for the fees view and projections, in percent a year.
alter table finance.accounts
  add column if not exists platform_fee_pct numeric(6,3) check (platform_fee_pct is null or (platform_fee_pct >= 0 and platform_fee_pct <= 10));

alter table finance.assets
  add column if not exists ongoing_charge_pct numeric(6,3) check (ongoing_charge_pct is null or (ongoing_charge_pct >= 0 and ongoing_charge_pct <= 10));
