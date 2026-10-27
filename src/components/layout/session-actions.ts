'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DEMO_COOKIE } from '@/lib/config';
import { getServerSupabase } from '@/lib/supabase/server';

export async function enterDemo() {
  const store = await cookies();
  store.set(DEMO_COOKIE, '1', { path: '/', sameSite: 'lax', httpOnly: false, maxAge: 60 * 60 * 24 * 30 });
  redirect('/');
}

export async function exitDemo() {
  const store = await cookies();
  store.delete(DEMO_COOKIE);
  redirect('/login');
}

export async function signOut() {
  const supabase = await getServerSupabase();
  await supabase?.auth.signOut();
  const store = await cookies();
  store.delete(DEMO_COOKIE);
  redirect('/login');
}
