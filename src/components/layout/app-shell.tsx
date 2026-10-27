'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FlaskConical, Plus, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuickAdd } from '@/components/forms/quick-add';
import { cn } from '@/lib/utils';
import { NAV, SECONDARY_NAV, isActive } from './nav';
import { exitDemo } from './session-actions';

export function AppShell({ children, mode, email, supabaseConfigured }: { children: React.ReactNode; mode: 'demo' | 'supabase'; email: string | null; supabaseConfigured: boolean }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-card/50 px-3 py-5 lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-3">
          <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 16l5-5 4 3 7-8" />
            </svg>
          </span>
          <span className="font-semibold tracking-tight">Portfolio</span>
        </Link>
        <QuickAdd
          trigger={
            <Button variant="brand" className="mb-4 w-full justify-start">
              <Plus /> Add
            </Button>
          }
        />
        <nav className="space-y-0.5" aria-label="Main">
          {[...NAV.slice(0, 4), ...SECONDARY_NAV, NAV[4]].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(pathname, href) ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                isActive(pathname, href) && 'bg-accent text-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto px-3 text-xs text-muted-foreground">
          {mode === 'demo' ? (
            <span className="flex items-center gap-1.5">
              <FlaskConical className="size-3.5" /> Demo mode
            </span>
          ) : (
            <span className="block truncate" title={email ?? ''}>
              {email}
            </span>
          )}
        </div>
      </aside>

      <div className="min-w-0">
        {mode === 'demo' ? (
          <div className="flex items-center justify-center gap-2 border-b bg-brand/10 px-4 py-2 text-center text-xs text-brand">
            <FlaskConical className="size-3.5 shrink-0" aria-hidden />
            <span>
              Demo mode: sample data stored only in this browser, never mixed with your real records.
              {supabaseConfigured ? (
                <form action={exitDemo} className="ml-1 inline">
                  <button className="font-semibold underline underline-offset-2">Sign in to your account</button>
                </form>
              ) : null}
            </span>
          </div>
        ) : null}

        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/80 px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 16l5-5 4 3 7-8" />
              </svg>
            </span>
            <span className="font-semibold tracking-tight">Portfolio</span>
          </Link>
          <Link
            href="/settings"
            aria-label="Settings"
            aria-current={isActive(pathname, '/settings') ? 'page' : undefined}
            className={cn('grid size-9 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground', isActive(pathname, '/settings') && 'bg-accent text-foreground')}
          >
            <Settings className="size-5" aria-hidden />
          </Link>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">{children}</main>
      </div>

      {/* Mobile bottom navigation: four tabs with Add in the middle; Settings sits in the header. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-safe backdrop-blur lg:hidden" aria-label="Main">
        <div className="mx-auto flex max-w-lg items-center">
          {MOBILE_TABS.slice(0, 2).map((item) => (
            <TabLink key={item.href} item={item} pathname={pathname} />
          ))}
          <div className="flex flex-1 justify-center">
            <QuickAdd
              align="center"
              trigger={
                <button
                  aria-label="Add"
                  className="-mt-5 grid size-14 place-items-center rounded-full bg-brand text-brand-foreground shadow-lg ring-4 ring-background transition-transform active:scale-95"
                >
                  <Plus className="size-6" strokeWidth={2.4} aria-hidden />
                </button>
              }
            />
          </div>
          {MOBILE_TABS.slice(2).map((item) => (
            <TabLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      </nav>
    </div>
  );
}

const MOBILE_TABS = NAV.filter((n) => n.href !== '/settings');

function TabLink({ item: { href, label, icon: Icon }, pathname }: { item: (typeof NAV)[number]; pathname: string }) {
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn('flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-muted-foreground transition-colors', active && 'text-foreground')}
    >
      <Icon className={cn('size-[22px]', active && 'text-brand')} strokeWidth={active ? 2.3 : 1.8} aria-hidden />
      {label}
    </Link>
  );
}
