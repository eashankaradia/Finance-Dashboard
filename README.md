# Portfolio: personal investment & finance tracker

A private, mobile-first web app for tracking investment accounts, valuations, contributions, holdings and performance. GBP by default, UK date formats.

**Stack:** Next.js 15 (App Router, TypeScript) · Tailwind CSS + shadcn/ui-style components · Supabase (Postgres, Auth, RLS) · Recharts · decimal.js · Vitest · Vercel.

You can try everything without any setup: run it locally and choose **Explore with demo data**. Demo data lives only in your browser's storage and never touches the database.

---

## What works

- **Dashboard**: total value, contributions, withdrawals, net contributions, investment gain/loss, time-weighted return and XIRR; portfolio value chart (1M / 3M / 6M / 1Y / All) with net-invested line and estimated points marked; accounts with latest values; allocation by account, asset class and holding; largest holdings; recent activity; best/worst performers; discrepancy warnings.
- **Accounts**: create, edit, archive, delete; ISA, LISA, Cash ISA, SIPP, workplace pension, GIA, cash savings, Premium Bonds, crypto, other. Provider, private reference (masked), currency, date opened, notes. Two valuation modes:
  - *Manual valuations*: record snapshots whenever you like. Snapshots are never overwritten; you can edit or delete them explicitly.
  - *Calculated from holdings*: holdings × latest prices + uninvested cash. Save the calculated value as a snapshot to build history.
- **Transactions**: contributions, withdrawals, transfers between your accounts (stored as two linked legs, edited/deleted together), buys, sells, dividends, interest, fees, adjustments. Optional linked holding, units, price and fees. Filters by account, type, date range and text; pagination; monthly and yearly deposit/withdrawal totals.
- **Holdings**: stocks, ETFs, funds, investment trusts and more, in UK (GBX/GBP) and US (USD) listings. Enter units and average price directly, record trades, or both. Average-cost cost basis, unrealised and realised gain, dividends, price source and last-update time. Sortable table on desktop, cards on mobile. Watchlist.
- **Market prices**: fetched server-side, cached, rate-limited, clearly labelled (delayed / previous close / manual / demo, market closed). Manual price fallback and refresh button.
- **Insights**: value over time, gain/loss over time, contributions vs withdrawals, account performance comparison, per-account performance table, allocation charts.
- **CSV export**: transactions (respects filters), holdings, valuation snapshots, account summaries.
- **Credit cards**: the statement/due-date tracker from the previous version, now per-user.
- Loading skeletons, empty states, confirmation dialogs, toasts, form validation, dark mode (follows the system).

## How the numbers work

Full explanation is in the app under **Settings → How the numbers are calculated**. In short:

| Concept | Rule |
| --- | --- |
| Account value | Exactly one value per account: the latest snapshot (*manual* accounts) or holdings × price + cash (*calculated* accounts). Holdings in a manually valued account are compared with the snapshot but never added on top. |
| External flows | Only deposits and withdrawals. Transfers between your own accounts count for each account but cancel out in portfolio totals. Buys/sells/dividends/interest/fees are never contributions. |
| Starting point | Contributions recorded before the first valuation → start from £0. Otherwise the first valuation (less any contributions that same day) is the opening balance. |
| Gain/loss | `current value + withdrawals − contributions − opening balance` |
| TWR | Valuations split history into sub-periods; each uses Modified Dietz with day-weighted flows; sub-periods are chain-linked. Marked *Estimate* when inputs are interpolated or large flows fall in long gaps. Annualised once a year of data exists. |
| XIRR | Money-weighted annual return on your actual cash flows (Newton–Raphson with bisection fallback). |
| History | Between valuations, values are interpolated (adjusted for flows in between) and shown as hollow chart points. |
| Precision | All arithmetic via `decimal.js`; database uses `numeric`, never float. |

The calculation engine lives in `src/lib/finance/` and is pure TypeScript with no UI dependencies.

## Tests

```bash
npm test          # unit tests: money, flows, TWR, XIRR, holdings, portfolio model, CSV, price parsing
npm run typecheck
npm run lint
```

Tests cover decimal safety, flow classification (transfers and trades are not contributions), the gain formula, TWR (including a deposit-neutral case), XIRR against a published spreadsheet example, average-cost holdings with fees, pence/USD conversion, no double counting of holdings vs snapshots, interpolation, and same-day valuation/contribution ordering.

## Database setup (Supabase)

1. Create a free project at [supabase.com](https://supabase.com) (choose an EU/London region).
2. Apply the schema, either:
   - **SQL editor:** paste `supabase/migrations/20261027000000_initial_schema.sql` into *SQL Editor → New query* and run it; or
   - **CLI:** `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. *Authentication → URL Configuration*: set **Site URL** to your app URL (e.g. `https://your-app.vercel.app`) and add `http://localhost:3000/**` and `https://your-app.vercel.app/**` to **Redirect URLs**.
4. Open the app, choose *Create your account*, confirm the email, sign in.
5. For a private app, then turn off sign-ups: *Authentication → Sign In / Providers → Email → Allow new users to sign up* = off.

The schema creates `profiles`, `accounts`, `account_snapshots`, `assets`, `holdings`, `transactions`, `market_prices`, `fx_rates`, `credit_cards`, `credit_card_bills`, with foreign keys, check constraints and indexes. Row Level Security is enabled on every table: each user can only read and write their own rows, and child rows can only reference the same user's parents (composite foreign keys). `market_prices` is readable by signed-in users and writable only with the service role. A `create_transfer` function writes both legs of a transfer atomically.

There's no SQL seed for real data on purpose: demo data is generated in the browser (`src/lib/data/demo.ts`) so it can never mix with your records.

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Where | Required | Get it from |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | For real data | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | For real data | Same page → `anon` `public` key (safe to expose; RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Recommended | Same page → `service_role` key. Lets the server write the shared price cache. Never expose it. |
| `ALPHA_VANTAGE_API_KEY` | server only | For live UK prices | Free key at [alphavantage.co](https://www.alphavantage.co/support/#api-key) |
| `FINNHUB_API_KEY` | server only | Optional | Free key at [finnhub.io](https://finnhub.io/register) (US tickers) |

Without the Supabase variables the app runs in demo mode only. Without market data keys, prices fall back to manual prices (or cost) and are labelled.

## Local development

```bash
npm install
cp .env.example .env.local   # optional: add Supabase + API keys
npm run dev                  # http://localhost:3000
```

Choose **Explore with demo data** on the sign-in page to use sample data. *Settings → Reset demo data* restores it.

## Deploying to Vercel

1. Push the repository to GitHub and import it at [vercel.com/new](https://vercel.com/new). The framework (Next.js) is detected automatically; no `vercel.json` is needed.
2. Add the environment variables above under *Settings → Environment Variables* (Production and Preview).
3. Deploy, then put the production URL into Supabase's Site URL / Redirect URLs (step 3 above).

## Market data: choices and limitations

Researched October 2026 (free tiers):

| Provider | Free allowance | UK (LSE) | US | Freshness |
| --- | --- | --- | --- | --- |
| **Alpha Vantage** (used) | 25 requests/day, 5/min | Yes (`VUSA.LON`) | Yes | Delayed / end of day |
| **Finnhub** (optional, US) | 60 requests/min | No (paid) | Yes | Delayed |
| Twelve Data | 800/day, 8/min | No (US only on free plan) | Yes | — |

- **Prices are not real-time.** They're labelled *Delayed* or *Close <date>*, with a *closed* marker outside exchange hours (LSE 08:00–16:30 UK, US 09:30–16:00 ET; holidays aren't modelled).
- Alpha Vantage's 25 requests/day is the binding limit. Prices are cached (15 min while the market is open, 6 h when closed) in the `market_prices` table, at most 5 symbols are fetched per refresh, and only signed-in users can call the price API. With many holdings, refresh in batches or set manual prices for funds.
- LSE quotes are usually in pence (GBX). Set *Quoted in* per investment (the form guesses from the ticker). Some LSE ETFs quote in GBP or USD.
- Unit trusts/OEICs (most UK funds) usually have no ticker. Use a manual price, or 1 unit valued at the total.
- Exchange rates come from the ECB via Frankfurter (free, no key, daily). Historical values in other currencies are converted at today's rate, and foreign holdings' gains exclude currency movements.
- Market data calls couldn't be exercised from the build environment (outbound access to the providers was blocked); response parsing follows the providers' documented formats. Check the Holdings page after adding your key.

## Project structure

```
src/
  app/                 routes (dashboard, accounts, holdings, activity, insights, settings, login, API)
  components/          UI primitives (ui/), charts, forms, layout, shared lists
  lib/finance/         calculation engine + tests
  lib/market/          price providers, cache, FX, market hours (server)
  lib/data/            repositories (Supabase / browser demo) and demo data
supabase/migrations/   database schema
```

## Changes from the previous version

The earlier Vite + React app was rebuilt on Next.js so price API keys stay on the server. Its features (pots with values and contributions, share transactions, credit card bills) are covered by accounts, snapshots, transactions, holdings and the credit cards page. One behavioural change: data is now private per user (the old schema shared all rows between any signed-in users). The old schema files are in git history; there was no existing database to migrate.
