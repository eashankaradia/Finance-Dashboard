import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Plus, ChevronRight, Calendar } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { ValueChart } from '../components/charts/ValueChart';
import { ContributionChart } from '../components/charts/ContributionChart';
import { Badge } from '../components/ui/Badge';
import { AddValueModal } from '../components/pots/AddValueModal';
import { AddContributionModal } from '../components/pots/AddContributionModal';
import { useAccounts } from '../hooks/useAccounts';
import { buildMonthlyContributions } from '../utils/calculations';
import { formatCurrency, formatChange, formatPercent, formatDate } from '../utils/formatting';
import { AccountPot, PotValueEntry, PotContribution } from '../types';

type Modal = { type: 'value'; pot: AccountPot } | { type: 'contribution'; pot: AccountPot } | { type: 'editValue'; entry: PotValueEntry } | { type: 'editContribution'; entry: PotContribution } | null;

function PotCard({
  pot,
  onAddValue,
  onAddContribution,
}: {
  pot: AccountPot;
  onAddValue: () => void;
  onAddContribution: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const gainColor = pot.gainLoss >= 0 ? 'text-emerald-600' : 'text-red-600';
  const monthlyContribs = buildMonthlyContributions(pot.contributionHistory);

  return (
    <Card padding={false} className="overflow-hidden">
      {/* Summary row */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-slate-900 text-base">{pot.name}</h3>
            {pot.lastUpdated && (
              <div className="flex items-center gap-1 mt-0.5">
                <Calendar size={11} className="text-slate-400" />
                <span className="text-xs text-slate-400">Updated {formatDate(pot.lastUpdated)}</span>
              </div>
            )}
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <ChevronRight size={18} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </button>
        </div>

        <p className="text-2xl font-bold text-slate-900 mb-2">{formatCurrency(pot.currentValue)}</p>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-xs text-slate-500">Contributed</p>
            <p className="text-sm font-semibold text-slate-900">{formatCurrency(pot.totalContributions)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Gain / Loss</p>
            <p className={`text-sm font-semibold ${gainColor}`}>{formatChange(pot.gainLoss)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Return</p>
            <div className="flex items-center gap-1">
              {pot.gainLoss >= 0
                ? <TrendingUp size={12} className="text-emerald-500" />
                : <TrendingDown size={12} className="text-red-500" />}
              <p className={`text-sm font-semibold ${gainColor}`}>{formatPercent(pot.returnPercent)}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <Button variant="secondary" size="sm" onClick={onAddValue} className="flex-1">
            <Plus size={14} /> Value
          </Button>
          <Button variant="secondary" size="sm" onClick={onAddContribution} className="flex-1">
            <Plus size={14} /> Contribution
          </Button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-4">
          {/* Value chart */}
          {pot.valueHistory.length >= 2 && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Value Over Time</p>
              <ValueChart data={pot.valueHistory} height={150} />
            </div>
          )}

          {/* Contributions chart */}
          {monthlyContribs.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Monthly Contributions</p>
              <ContributionChart data={monthlyContribs} height={130} />
            </div>
          )}

          {/* Value history table */}
          {pot.valueHistory.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Value History</p>
              <div className="space-y-1">
                {[...pot.valueHistory].reverse().slice(0, 6).map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                    <div>
                      <p className="text-sm text-slate-700">{formatDate(entry.date)}</p>
                      {entry.notes && <p className="text-xs text-slate-400">{entry.notes}</p>}
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{formatCurrency(entry.value)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contribution history */}
          {pot.contributionHistory.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Contributions</p>
              <div className="space-y-1">
                {[...pot.contributionHistory].reverse().slice(0, 6).map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                    <div>
                      <p className="text-sm text-slate-700">{formatDate(c.date)}</p>
                      {c.notes && <p className="text-xs text-slate-400">{c.notes}</p>}
                    </div>
                    <Badge variant="green">+{formatCurrency(c.amount)}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function PotsPage() {
  const { pots, loading, error, addValue, updateValue, addContribution, updateContribution } = useAccounts();
  const [modal, setModal] = useState<Modal>(null);
  const navigate = useNavigate();

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-lg mx-auto">
      <PageHeader title="Investment Pots" />

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {pots.length === 0 ? (
        <EmptyState
          title="No investment accounts yet"
          description="Run the sample data seed from Settings to get started."
          action={<Button variant="secondary" onClick={() => navigate('/settings')}>Go to Settings</Button>}
        />
      ) : (
        pots.map((pot) => (
          <PotCard
            key={pot.id}
            pot={pot}
            onAddValue={() => setModal({ type: 'value', pot })}
            onAddContribution={() => setModal({ type: 'contribution', pot })}
          />
        ))
      )}

      {/* Total summary at bottom */}
      {pots.length > 1 && (
        <Card className="bg-indigo-50 border-indigo-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-indigo-600 font-medium uppercase tracking-wide">Total Portfolio</p>
              <p className="text-xl font-bold text-indigo-900 mt-0.5">
                {formatCurrency(pots.reduce((s, p) => s + p.currentValue, 0))}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-indigo-600">Total contributed</p>
              <p className="text-sm font-semibold text-indigo-800">
                {formatCurrency(pots.reduce((s, p) => s + p.totalContributions, 0))}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Modals */}
      {modal?.type === 'value' && (
        <AddValueModal
          pots={pots}
          defaultPotId={modal.pot.id}
          onSave={addValue}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'editValue' && (
        <AddValueModal
          pots={pots}
          editEntry={modal.entry}
          onSave={addValue}
          onUpdate={updateValue}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'contribution' && (
        <AddContributionModal
          pots={pots}
          defaultPotId={modal.pot.id}
          onSave={addContribution}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'editContribution' && (
        <AddContributionModal
          pots={pots}
          editEntry={modal.entry}
          onSave={addContribution}
          onUpdate={updateContribution}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
