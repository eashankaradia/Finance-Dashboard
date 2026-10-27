import { isSupabaseConfigured } from '@/lib/config';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 16l5-5 4 3 7-8" />
            </svg>
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your private investment tracker</p>
        </div>
        <LoginForm configured={isSupabaseConfigured} next={params.next ?? '/'} initialError={params.error ?? null} />
      </div>
    </div>
  );
}
