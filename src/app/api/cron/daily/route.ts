import { NextResponse } from 'next/server';
import { runDailyUpdate } from '@/lib/market/daily';
import { getServiceSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Called by Vercel Cron (see vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; anything else is rejected.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const db = getServiceSupabase();
  if (!db) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set' }, { status: 503 });
  try {
    const result = await runDailyUpdate(db);
    console.log('daily update', JSON.stringify(result));
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Daily update failed';
    console.error('daily update failed', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
