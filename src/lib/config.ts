// Public configuration. NEXT_PUBLIC_* values are safe to expose to the
// browser (the Supabase anon key is designed to be public; RLS protects data).

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Cookie set when the visitor chooses the local demo instead of signing in. */
export const DEMO_COOKIE = 'fd_demo';
