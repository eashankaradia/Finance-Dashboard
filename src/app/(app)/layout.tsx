import { cookies } from 'next/headers';
import { AppShell } from '@/components/layout/app-shell';
import { DataProvider } from '@/components/providers/data-provider';
import { DEMO_COOKIE, isSupabaseConfigured } from '@/lib/config';
import { getServerSupabase } from '@/lib/supabase/server';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const demo = cookieStore.get(DEMO_COOKIE)?.value === '1' || !isSupabaseConfigured;
  let email: string | null = null;
  if (!demo) {
    const supabase = await getServerSupabase();
    const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
    email = data.user?.email ?? null;
  }
  const mode = demo ? 'demo' : 'supabase';
  return (
    <DataProvider mode={mode}>
      <AppShell mode={mode} email={email} supabaseConfigured={isSupabaseConfigured}>
        {children}
      </AppShell>
    </DataProvider>
  );
}
