import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

// Handles the link in Supabase confirmation / magic-link emails.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (code) {
    const supabase = await getServerSupabase();
    const { error } = (await supabase?.auth.exchangeCodeForSession(code)) ?? { error: null };
    if (error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
  }
  return NextResponse.redirect(new URL('/', url.origin));
}
