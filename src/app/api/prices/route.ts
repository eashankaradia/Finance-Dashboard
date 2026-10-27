import { NextResponse } from 'next/server';
import { getPrices } from '@/lib/market/service';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const SYMBOL_RE = /^[A-Za-z0-9.\-:^=]{1,32}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

export async function POST(request: Request) {
  // Only signed-in users may spend the market data API allowance.
  const supabase = await getServerSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let body: { symbols?: { symbol: string; currency: string }[]; force?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const requests = (body.symbols ?? [])
    .filter((s) => typeof s?.symbol === 'string' && SYMBOL_RE.test(s.symbol))
    .map((s) => ({ symbol: s.symbol.toUpperCase(), currency: CURRENCY_RE.test(s.currency) ? s.currency : 'GBP' }))
    .slice(0, 50);

  try {
    const result = await getPrices(requests, { force: Boolean(body.force), reader: supabase, writer: getServiceSupabase() });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Price service unavailable' }, { status: 502 });
  }
}
