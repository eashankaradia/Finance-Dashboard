-- Finance Dashboard — Supabase Schema
-- Run this in the Supabase SQL Editor (Database → SQL Editor → New query)
-- Safe to re-run: all statements use IF NOT EXISTS

-- Investment accounts (pots)
CREATE TABLE IF NOT EXISTS accounts (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Value snapshots for each account over time
CREATE TABLE IF NOT EXISTS account_values (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  value      NUMERIC(12, 2) NOT NULL CHECK (value >= 0),
  date       DATE NOT NULL,
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_account_values_account_id ON account_values(account_id);
CREATE INDEX IF NOT EXISTS idx_account_values_date       ON account_values(date);

-- Contributions (money added) to each account
CREATE TABLE IF NOT EXISTS contributions (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  amount     NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  date       DATE NOT NULL,
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contributions_account_id ON contributions(account_id);
CREATE INDEX IF NOT EXISTS idx_contributions_date       ON contributions(date);

-- Share holdings (one row per ticker)
CREATE TABLE IF NOT EXISTS share_holdings (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker     TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Individual share transactions (buys and sells)
-- Prices are stored in GBP (e.g. LLOY at 57.24p → 0.5724)
CREATE TABLE IF NOT EXISTS share_transactions (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  holding_id UUID REFERENCES share_holdings(id) ON DELETE CASCADE NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
  date       DATE NOT NULL,
  quantity   NUMERIC(12, 4) NOT NULL CHECK (quantity > 0),
  price      NUMERIC(12, 6) NOT NULL CHECK (price > 0),
  fees       NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (fees >= 0),
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_share_transactions_holding_id ON share_transactions(holding_id);
CREATE INDEX IF NOT EXISTS idx_share_transactions_date       ON share_transactions(date);

-- Credit cards
CREATE TABLE IF NOT EXISTS credit_cards (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name         TEXT NOT NULL,
  credit_limit NUMERIC(12, 2),
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Credit card bills / statements
CREATE TABLE IF NOT EXISTS credit_card_bills (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id         UUID REFERENCES credit_cards(id) ON DELETE CASCADE NOT NULL,
  statement_date  DATE NOT NULL,
  due_date        DATE NOT NULL,
  amount_due      NUMERIC(12, 2) NOT NULL CHECK (amount_due >= 0),
  amount_paid     NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  minimum_payment NUMERIC(12, 2),
  status          TEXT NOT NULL DEFAULT 'unpaid'
                    CHECK (status IN ('paid', 'due_soon', 'unpaid', 'overdue')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credit_card_bills_card_id  ON credit_card_bills(card_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_bills_due_date ON credit_card_bills(due_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- Both users share all data. Any authenticated user can read and write everything.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE accounts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_values     ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_holdings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_cards       ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_card_bills  ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (safe to re-run)
DROP POLICY IF EXISTS "auth_all" ON accounts;
DROP POLICY IF EXISTS "auth_all" ON account_values;
DROP POLICY IF EXISTS "auth_all" ON contributions;
DROP POLICY IF EXISTS "auth_all" ON share_holdings;
DROP POLICY IF EXISTS "auth_all" ON share_transactions;
DROP POLICY IF EXISTS "auth_all" ON credit_cards;
DROP POLICY IF EXISTS "auth_all" ON credit_card_bills;

CREATE POLICY "auth_all" ON accounts           FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON account_values     FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON contributions      FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON share_holdings     FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON share_transactions FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON credit_cards       FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON credit_card_bills  FOR ALL USING (auth.role() = 'authenticated');
