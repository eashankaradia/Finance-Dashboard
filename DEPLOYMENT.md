# Deployment Guide

## 1. Supabase Setup

1. Create a new project at https://supabase.com
2. Go to **Database → SQL Editor → New query**
3. Paste and run `supabase/schema.sql`
4. (Optional) Paste and run `supabase/seed.sql` to load sample data
5. Go to **Authentication → Users** and create accounts for yourself and your partner

Get your credentials from **Project Settings → API**:
- `VITE_SUPABASE_URL` — Project URL
- `VITE_SUPABASE_ANON_KEY` — `anon` / `public` key

## 2. Local Development

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env and paste your Supabase URL and anon key

# Start development server
npm run dev
```

## 3. Deploy to Vercel

### Option A — Vercel Dashboard (recommended)
1. Push this repo to GitHub
2. Go to https://vercel.com/new and import the repo
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy**

### Option B — Vercel CLI
```bash
npm install -g vercel
vercel
# Follow prompts, then add env vars:
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
vercel --prod
```

## 4. Load Sample Data

After logging in, go to **Settings → Load sample data**. This seeds realistic demo data
(HL, Trading 212, LLOY shares, Amex, Lloyds cards) and can be run any time to reset.

## 5. User Management

Both users share all data. Add additional users via **Supabase → Authentication → Users → Invite user**.

## 6. Real Market Prices

Edit `src/services/marketData.ts` and replace `MockMarketDataProvider` with a real provider.
Comments in that file show exactly where to plug in Twelve Data, Alpha Vantage, Finnhub, or Polygon.
