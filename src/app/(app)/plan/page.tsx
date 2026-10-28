'use client';

import * as React from 'react';
import { ErrorState, PageHeader, PageSkeleton } from '@/components/common';
import { Segmented } from '@/components/ui/tabs';
import { useData } from '@/components/providers/data-provider';
import { IsaTab } from './isa-tab';
import { FeesTab } from './fees-tab';
import { ProjectionTab } from './projection-tab';

const TABS = [
  { value: 'isa', label: 'ISA allowance' },
  { value: 'fees', label: 'Fees' },
  { value: 'projection', label: 'Projection' },
] as const;
type Tab = (typeof TABS)[number]['value'];

export default function PlanPage() {
  const { status, error, reload } = useData();
  const [tab, setTab] = React.useState<Tab>('isa');

  // The tab lives in the URL hash so links like /plan#fees work.
  React.useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      if (TABS.some((t) => t.value === h)) setTab(h as Tab);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const choose = (t: Tab) => {
    setTab(t);
    history.replaceState(null, '', `#${t}`);
  };

  if (status === 'loading') return <PageSkeleton />;
  if (status === 'error') return <ErrorState message={error ?? ''} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <PageHeader title="Plan" description="ISA allowance, fees and what your money could grow to" />
      <Segmented label="Section" value={tab} onChange={choose} options={TABS.map((t) => ({ value: t.value, label: t.label }))} className="w-full sm:w-auto [&>button]:flex-1 [&>button]:whitespace-nowrap" />
      {tab === 'isa' ? <IsaTab /> : tab === 'fees' ? <FeesTab /> : <ProjectionTab />}
    </div>
  );
}
