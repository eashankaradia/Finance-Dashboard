import type { SupabaseClient } from '@supabase/supabase-js';

/** Untyped Supabase client bound to the app's schema (see DB_SCHEMA). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, any, any>;
