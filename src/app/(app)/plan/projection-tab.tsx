'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Segmented } from '@/components/ui/tabs';
import { ProjectionChart } from '@/components/charts';
import { Money, Notice, StatCard } from '@/components/common';
import { useData } from '@/components/providers/data-provider';
import { potsFromPortfolio, project, type Pot } from '@/lib/finance/projection';
import { formatMoney } from '@/lib/format';

interface Settings {
  growth: string;
  years: string;
  monthly: Record<string, string>;
  included: Record<string, boolean>;
}

const STORAGE_KEY = 'plan-projection-v1';
const DEFAULTS: Settings = { growth: '5', years: '10', monthly: {}, included: {} };
const GROWTH_PRESETS = ['3', '5', '7'] as const;

// Remembered on this device only: a convenience, not saved data.
function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

const num = (s: string | undefined, fallback = 0) => {
  const n = Number(String(s ?? '').replace(/[£,\s%]/g, ''));
  return Number.isFinite(n) ? n : fallback;
};

export function ProjectionTab() {
  const { model, fx } = useData();
  const [s, setS] = React.useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    setS(loadSettings());
    setLoaded(true);
  }, []);
  React.useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // Private mode etc.: settings just aren't remembered.
    }
  }, [s, loaded]);

  const sources = React.useMemo(() => potsFromPortfolio(model, fx.rates), [model, fx.rates]);
  const included = (id: string, cashLike: boolean) => s.included[id] ?? !cashLike;

  const growth = Math.min(30, Math.max(-20, num(s.growth, 5))) / 100;
  const years = Math.min(50, Math.max(1, Math.round(num(s.years, 10))));
  const pots: Pot[] = sources.filter((p) => included(p.id, p.cashLike)).map((p) => ({ ...p, monthly: Math.max(0, num(s.monthly[p.id])) }));
  const result = project(pots, { growth, years });
  const lower = project(pots, { growth: growth - 0.02, years });
  const higher = project(pots, { growth: growth + 0.02, years });
  const fromContributions = result.final - result.finalWithout;

  const setMonthly = (id: string, v: string) => setS((x) => ({ ...x, monthly: { ...x.monthly, [id]: v } }));
  const setIncluded = (id: string, v: boolean) => setS((x) => ({ ...x, included: { ...x.included, [id]: v } }));
  const setAllMonthly = (v: string) => setS((x) => ({ ...x, monthly: Object.fromEntries(pots.map((p) => [p.id, v])) }));

  if (!sources.length) return <Notice>Add an account with a value to project its growth.</Notice>;

  return (
    <div className="space-y-5">
      <Notice tone="warn">
        These are illustrations, not forecasts. Real returns go up and down, aren&apos;t guaranteed and can be negative. Charges you&apos;ve entered are taken off the growth rate.
      </Notice>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Projection summary">
        <StatCard label={`In ${years} years`} value={<Money value={result.final} />} sub={`at ${(growth * 100).toFixed(1)}% a year`} />
        <StatCard label="You'd pay in" value={<Money value={result.monthlyTotal * years * 12} />} sub={`${formatMoney(result.monthlyTotal)} a month`} />
        <StatCard label="Without new money" value={<Money value={result.finalWithout} />} sub={`Contributions add ${formatMoney(fromContributions, 'GBP', { compact: true })}`} />
        <StatCard
          label="Range (±2% growth)"
          value={<span className="text-base sm:text-lg">{formatMoney(lower.final, 'GBP', { compact: true })} – {formatMoney(higher.final, 'GBP', { compact: true })}</span>}
          sub={`${((growth - 0.02) * 100).toFixed(0)}% to ${((growth + 0.02) * 100).toFixed(0)}% a year`}
        />
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Projected value</CardTitle>
            <CardDescription>Today&apos;s value of the pots you&apos;ve included, grown monthly</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[auto_8rem_8rem] sm:items-end">
            <div className="col-span-2 sm:col-span-1">
              <p className="mb-1.5 text-sm font-medium">Growth a year</p>
              <Segmented
                label="Growth preset"
                value={(GROWTH_PRESETS as readonly string[]).includes(s.growth) ? s.growth : ''}
                onChange={(v) => setS((x) => ({ ...x, growth: v }))}
                options={GROWTH_PRESETS.map((g) => ({ value: g, label: `${g}%` }))}
              />
            </div>
            <Field label="Custom %" htmlFor="pj-growth">
              <Input id="pj-growth" inputMode="decimal" value={s.growth} onChange={(e) => setS({ ...s, growth: e.target.value })} />
            </Field>
            <Field label="Years" htmlFor="pj-years">
              <Input id="pj-years" inputMode="numeric" value={s.years} onChange={(e) => setS({ ...s, years: e.target.value })} />
            </Field>
          </div>
          <ProjectionChart points={result.points} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Monthly contributions</CardTitle>
            <CardDescription>Try different amounts for each holding. Remembered on this device.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-1 pt-0">
          <div className="flex flex-wrap items-center gap-2 pb-2 text-xs text-muted-foreground">
            Set all included to:
            {['0', '50', '100', '250'].map((v) => (
              <button key={v} type="button" onClick={() => setAllMonthly(v)} className="rounded-lg bg-muted px-2 py-1 font-medium text-foreground">
                £{v}
              </button>
            ))}
          </div>
          <div className="divide-y">
            {sources.map((p) => {
              const on = included(p.id, p.cashLike);
              const r = result.pots.find((x) => x.pot.id === p.id);
              return (
                <div key={p.id} className="flex items-center gap-3 py-3">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => setIncluded(p.id, e.target.checked)}
                    aria-label={`Include ${p.label}`}
                    className="size-4 shrink-0 accent-[hsl(var(--brand))]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.sub} · {formatMoney(p.value)} now{p.feePct ? ` · ${+p.feePct.toFixed(3)}% charges` : ''}
                    </p>
                    {on && r ? (
                      <p className="text-xs">
                        → <span className="font-medium tabular">{formatMoney(r.final)}</span>
                        <span className="text-muted-foreground"> in {years}y</span>
                      </p>
                    ) : null}
                  </div>
                  <div className="relative w-24 shrink-0">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                    <Input
                      inputMode="decimal"
                      aria-label={`Monthly contribution to ${p.label}`}
                      value={s.monthly[p.id] ?? ''}
                      placeholder="0"
                      disabled={!on}
                      onChange={(e) => setMonthly(p.id, e.target.value)}
                      className="pl-6 text-right"
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="pt-2 text-xs text-muted-foreground">
            Cash and Premium Bonds are left out by default because they don&apos;t grow like investments. Accounts valued from manual valuations project as one pot.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
