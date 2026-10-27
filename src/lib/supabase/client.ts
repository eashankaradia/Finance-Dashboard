'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Db } from '@/lib/supabase/types';
import { DB_SCHEMA, SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '../config';

let client: Db | null = null;

export function getBrowserSupabase(): Db | null {
  if (!isSupabaseConfigured) return null;
  if (!client) client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: DB_SCHEMA } });
  return client;
}
