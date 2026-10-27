'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Notice } from '@/components/common';
import { enterDemo } from '@/components/layout/session-actions';
import { getBrowserSupabase } from '@/lib/supabase/client';

export function LoginForm({ configured, next, initialError }: { configured: boolean; next: string; initialError: string | null }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(initialError);
  const [info, setInfo] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next.startsWith('/') ? next : '/');
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        if (data.session) {
          router.replace('/');
          router.refresh();
        } else {
          setInfo('Check your email to confirm your account, then sign in.');
          setMode('signin');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {configured ? (
        <Card className="p-5">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password" htmlFor="password" hint={mode === 'signup' ? 'At least 8 characters.' : undefined}>
              <Input
                id="password"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'signup' ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            {info ? <p className="text-sm text-gain">{info}</p> : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            {mode === 'signin' ? 'First time here? ' : 'Already have an account? '}
            <button className="font-medium text-foreground underline underline-offset-2" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
              {mode === 'signin' ? 'Create your account' : 'Sign in'}
            </button>
          </p>
        </Card>
      ) : (
        <Notice tone="warn">
          Supabase isn&apos;t configured yet, so sign-in is unavailable. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (see README), or explore the demo below.
        </Notice>
      )}
      <form action={enterDemo}>
        <Button variant="outline" className="w-full" type="submit">
          <FlaskConical /> Explore with demo data
        </Button>
      </form>
      <p className="text-center text-xs text-muted-foreground">Demo data lives only in this browser and is never saved to your account.</p>
    </div>
  );
}
