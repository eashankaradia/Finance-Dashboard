import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { Db } from './types';
import { cookies } from 'next/headers';
import { DB_SCHEMA, SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '../config';

/** Supabase client acting as the signed-in user (RLS applies). */
export async function getServerSupabase(): Promise<Db | null> {
  if (!isSupabaseConfigured) return null;
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: DB_SCHEMA },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there; the
          // middleware refreshes the session instead.
        }
      },
    },
  });
}

/**
 * Service-role client for writing the shared market price cache. Only ever
 * used on the server; the key must never be exposed to the browser.
 */
export function getServiceSupabase(): Db | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isSupabaseConfigured || !key) return null;
  return createClient(SUPABASE_URL, key, {
    db: { schema: DB_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
