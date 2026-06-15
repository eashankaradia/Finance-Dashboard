import { useState } from 'react';
import { Download, Upload, Database, LogOut, RefreshCw } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { supabase } from '../lib/supabase';
import { useAccounts } from '../hooks/useAccounts';
import { useShares } from '../hooks/useShares';
import { useCreditCards } from '../hooks/useCreditCards';

// Sample data seeded directly from the UI — mirrors supabase/seed.sql
const SAMPLE_ACCOUNTS = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Hargreaves Lansdown', description: 'Stocks & Shares ISA' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Trading 212', description: 'Invest Account' },
];

const HL_ID = '11111111-1111-1111-1111-111111111111';
const T212_ID = '22222222-2222-2222-2222-222222222222';
const LLOY_ID = '33333333-3333-3333-3333-333333333333';
const AMEX_ID = '44444444-4444-4444-4444-444444444444';
const LLOYDS_CARD_ID = '55555555-5555-5555-5555-555555555555';

const HL_VALUES = [
  { value: 8520, date: '2025-01-31' }, { value: 8680, date: '2025-02-28' },
  { value: 8950, date: '2025-03-31' }, { value: 9120, date: '2025-04-30' },
  { value: 9340, date: '2025-05-31' }, { value: 9280, date: '2025-06-30' },
  { value: 9510, date: '2025-07-31' }, { value: 9750, date: '2025-08-31' },
  { value: 9920, date: '2025-09-30' }, { value: 10240, date: '2025-10-31' },
  { value: 10510, date: '2025-11-30' }, { value: 10780, date: '2025-12-31' },
  { value: 10920, date: '2026-01-31' }, { value: 11050, date: '2026-02-28' },
  { value: 11180, date: '2026-03-31' }, { value: 11320, date: '2026-04-30' },
  { value: 11090, date: '2026-05-31' }, { value: 11240, date: '2026-06-15' },
];

const T212_VALUES = [
  { value: 1180, date: '2025-01-31' }, { value: 1210, date: '2025-02-28' },
  { value: 1265, date: '2025-03-31' }, { value: 1290, date: '2025-04-30' },
  { value: 1340, date: '2025-05-31' }, { value: 1310, date: '2025-06-30' },
  { value: 1380, date: '2025-07-31' }, { value: 1420, date: '2025-08-31' },
  { value: 1510, date: '2025-09-30' }, { value: 1580, date: '2025-10-31' },
  { value: 1640, date: '2025-11-30' }, { value: 1720, date: '2025-12-31' },
  { value: 1780, date: '2026-01-31' }, { value: 1830, date: '2026-02-28' },
  { value: 1890, date: '2026-03-31' }, { value: 1940, date: '2026-04-30' },
  { value: 2010, date: '2026-05-31' }, { value: 2050, date: '2026-06-15' },
];

function monthlyContribs(accountId: string, amount: number) {
  const months = [
    '2025-01-15','2025-02-15','2025-03-15','2025-04-15','2025-05-15','2025-06-15',
    '2025-07-15','2025-08-15','2025-09-15','2025-10-15','2025-11-15','2025-12-15',
    '2026-01-15','2026-02-15','2026-03-15','2026-04-15','2026-05-15','2026-06-15',
  ];
  return months.map((date) => ({ account_id: accountId, amount, date, notes: 'Monthly contribution' }));
}

async function seedSampleData() {
  // Clear all tables in dependency order
  await supabase.from('credit_card_bills').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('credit_cards').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('share_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('share_holdings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('contributions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('account_values').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('accounts').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // Accounts
  const { error: accErr } = await supabase.from('accounts').insert(SAMPLE_ACCOUNTS);
  if (accErr) throw accErr;

  // Values
  const allValues = [
    ...HL_VALUES.map((v) => ({ ...v, account_id: HL_ID })),
    ...T212_VALUES.map((v) => ({ ...v, account_id: T212_ID })),
  ];
  const { error: valErr } = await supabase.from('account_values').insert(allValues);
  if (valErr) throw valErr;

  // Contributions
  const allContribs = [...monthlyContribs(HL_ID, 200), ...monthlyContribs(T212_ID, 50)];
  const { error: contribErr } = await supabase.from('contributions').insert(allContribs);
  if (contribErr) throw contribErr;

  // Share holdings
  const { error: holdErr } = await supabase
    .from('share_holdings')
    .insert([{ id: LLOY_ID, ticker: 'LLOY', name: 'Lloyds Banking Group' }]);
  if (holdErr) throw holdErr;

  // Share transactions (prices stored in GBP: 57.24p = £0.5724)
  const { error: txErr } = await supabase.from('share_transactions').insert([
    { holding_id: LLOY_ID, type: 'buy', date: '2025-01-15', quantity: 1000, price: 0.5250, fees: 11.95, notes: 'Initial purchase' },
    { holding_id: LLOY_ID, type: 'buy', date: '2025-03-20', quantity: 500, price: 0.5420, fees: 11.95, notes: 'Adding to position' },
    { holding_id: LLOY_ID, type: 'buy', date: '2025-06-10', quantity: 500, price: 0.5500, fees: 11.95, notes: 'Regular investment' },
  ]);
  if (txErr) throw txErr;

  // Credit cards
  const { error: cardErr } = await supabase.from('credit_cards').insert([
    { id: AMEX_ID, name: 'American Express', credit_limit: 5000 },
    { id: LLOYDS_CARD_ID, name: 'Lloyds', credit_limit: 2000 },
  ]);
  if (cardErr) throw cardErr;

  // Credit card bills
  const { error: billErr } = await supabase.from('credit_card_bills').insert([
    { card_id: AMEX_ID, statement_date: '2025-12-01', due_date: '2025-12-28', amount_due: 620.45, amount_paid: 620.45, minimum_payment: 25, status: 'paid' },
    { card_id: AMEX_ID, statement_date: '2026-01-01', due_date: '2026-01-28', amount_due: 534.20, amount_paid: 534.20, minimum_payment: 25, status: 'paid' },
    { card_id: AMEX_ID, statement_date: '2026-02-01', due_date: '2026-02-28', amount_due: 489.70, amount_paid: 489.70, minimum_payment: 25, status: 'paid' },
    { card_id: AMEX_ID, statement_date: '2026-03-01', due_date: '2026-03-28', amount_due: 712.30, amount_paid: 712.30, minimum_payment: 25, status: 'paid' },
    { card_id: AMEX_ID, statement_date: '2026-04-01', due_date: '2026-04-28', amount_due: 445.80, amount_paid: 445.80, minimum_payment: 25, status: 'paid' },
    { card_id: AMEX_ID, statement_date: '2026-05-01', due_date: '2026-05-28', amount_due: 380.15, amount_paid: 380.15, minimum_payment: 25, status: 'paid' },
    { card_id: AMEX_ID, statement_date: '2026-06-01', due_date: '2026-06-25', amount_due: 452.40, amount_paid: 0, minimum_payment: 25, status: 'due_soon' },
    { card_id: LLOYDS_CARD_ID, statement_date: '2025-12-05', due_date: '2026-01-02', amount_due: 180.50, amount_paid: 180.50, minimum_payment: 25, status: 'paid' },
    { card_id: LLOYDS_CARD_ID, statement_date: '2026-01-05', due_date: '2026-02-02', amount_due: 220.30, amount_paid: 220.30, minimum_payment: 25, status: 'paid' },
    { card_id: LLOYDS_CARD_ID, statement_date: '2026-02-05', due_date: '2026-03-02', amount_due: 165.75, amount_paid: 165.75, minimum_payment: 25, status: 'paid' },
    { card_id: LLOYDS_CARD_ID, statement_date: '2026-03-05', due_date: '2026-04-02', amount_due: 310.20, amount_paid: 310.20, minimum_payment: 25, status: 'paid' },
    { card_id: LLOYDS_CARD_ID, statement_date: '2026-04-05', due_date: '2026-05-02', amount_due: 195.40, amount_paid: 195.40, minimum_payment: 25, status: 'paid' },
    { card_id: LLOYDS_CARD_ID, statement_date: '2026-05-05', due_date: '2026-06-02', amount_due: 278.90, amount_paid: 278.90, minimum_payment: 25, status: 'paid' },
    { card_id: LLOYDS_CARD_ID, statement_date: '2026-06-05', due_date: '2026-07-02', amount_due: 285.60, amount_paid: 0, minimum_payment: 25, status: 'unpaid' },
  ]);
  if (billErr) throw billErr;
}

async function exportAllData() {
  const [accounts, values, contribs, holdings, transactions, cards, bills] = await Promise.all([
    supabase.from('accounts').select('*'),
    supabase.from('account_values').select('*'),
    supabase.from('contributions').select('*'),
    supabase.from('share_holdings').select('*'),
    supabase.from('share_transactions').select('*'),
    supabase.from('credit_cards').select('*'),
    supabase.from('credit_card_bills').select('*'),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    accounts: accounts.data,
    account_values: values.data,
    contributions: contribs.data,
    share_holdings: holdings.data,
    share_transactions: transactions.data,
    credit_cards: cards.data,
    credit_card_bills: bills.data,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finance-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function SettingRow({ icon: Icon, label, description, action }: {
  icon: React.ElementType;
  label: string;
  description?: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <Icon size={16} className="text-slate-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-900">{label}</p>
          {description && <p className="text-xs text-slate-400">{description}</p>}
        </div>
      </div>
      <div className="flex-shrink-0">{action}</div>
    </div>
  );
}

export function SettingsPage() {
  const { refresh: refreshAccounts } = useAccounts();
  const { refresh: refreshShares } = useShares();
  const { refresh: refreshCards } = useCreditCards();
  const [seeding, setSeeding] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleSeed() {
    if (!confirm('This will delete ALL existing data and replace it with sample data. Continue?')) return;
    setSeeding(true);
    setMessage(null);
    try {
      await seedSampleData();
      await Promise.all([refreshAccounts(), refreshShares(), refreshCards()]);
      setMessage({ type: 'success', text: 'Sample data loaded successfully.' });
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Failed to seed data' });
    } finally {
      setSeeding(false);
    }
  }

  async function handleExport() {
    try {
      await exportAllData();
      setMessage({ type: 'success', text: 'Data exported.' });
    } catch (e) {
      setMessage({ type: 'error', text: 'Export failed' });
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-lg mx-auto">
      <PageHeader title="Settings" />

      {message && (
        <div className={`rounded-xl px-4 py-3 text-sm ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      <Card padding={false}>
        <div className="px-4 pt-1 pb-1">
          <SettingRow
            icon={Download}
            label="Export data"
            description="Download all data as JSON backup"
            action={
              <Button variant="secondary" size="sm" onClick={handleExport}>
                Export
              </Button>
            }
          />
          <SettingRow
            icon={Database}
            label="Load sample data"
            description="Replaces all data with realistic demo data"
            action={
              <Button variant="secondary" size="sm" onClick={handleSeed} loading={seeding}>
                <RefreshCw size={13} /> Load
              </Button>
            }
          />
          <SettingRow
            icon={Upload}
            label="Import JSON"
            description="Restore from a backup file (coming soon)"
            action={
              <Button variant="secondary" size="sm" disabled>
                Import
              </Button>
            }
          />
          <SettingRow
            icon={LogOut}
            label="Sign out"
            action={
              <Button variant="danger" size="sm" onClick={handleSignOut}>
                Sign out
              </Button>
            }
          />
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">About</h3>
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Version</span>
            <span className="text-slate-900 font-medium">0.1.0</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Database</span>
            <span className="text-slate-900 font-medium">Supabase</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Market data</span>
            <span className="text-amber-600 font-medium">Mock provider</span>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3 leading-relaxed">
          Connect a real market data provider in <code className="bg-slate-100 px-1 rounded">src/services/marketData.ts</code>.
          See comments for Twelve Data, Alpha Vantage, Finnhub, and Polygon.
        </p>
      </Card>
    </div>
  );
}
