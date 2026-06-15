import { useMemo } from 'react';
import { TrendingUp, TrendingDown, CreditCard, Wallet, PiggyBank, BarChart2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge, billStatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ValueChart } from '../components/charts/ValueChart';
import { ContributionChart } from '../components/charts/ContributionChart';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useAccounts } from '../hooks/useAccounts';
import { useShares } from '../hooks/useShares';
import { useCreditCards } from '../hooks/useCreditCards';
import { buildPortfolioHistory, buildMonthlyContributions, computeMonthlyValueChange } from '../utils/calculations';
import { formatCurrency, formatChange, formatPercent, formatDate, daysUntil } from '../utils/formatting';
import { useState } from 'react';
import { AddValueModal } from '../components/pots/AddValueModal';
import { AddContributionModal } from '../components/pots/AddContributionModal';
import { AddTransactionModal } from '../components/shares/AddTransactionModal';
import { AddBillModal } from '../components/creditcards/AddBillModal';

type QuickAction = 'value' | 'contribution' | 'transaction' | 'bill' | null;

function MetricRow({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-slate-500">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold text-slate-900">{value}</span>
        {sub && <div className="text-xs text-slate-400">{sub}</div>}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { pots, allValues, allContributions, loading: potsLoading, addValue, addContribution } = useAccounts();
  const { holdings, loading: sharesLoading, addTransaction } = useShares();
  const { cards, bills, loading: cardsLoading, addBill } = useCreditCards();
  const [quickAction, setQuickAction] = useState<QuickAction>(null);

  const loading = potsLoading || sharesLoading || cardsLoading;

  const metrics = useMemo(() => {
    const totalPortfolioValue = pots.reduce((s, p) => s + p.currentValue, 0);
    const totalContributions = pots.reduce((s, p) => s + p.totalContributions, 0);
    const shareValue = holdings.reduce((s, h) => s + h.currentValue, 0);
    const totalGainLoss = totalPortfolioValue - totalContributions;
    const totalReturnPercent = totalContributions > 0 ? (totalGainLoss / totalContributions) * 100 : 0;

    // Monthly change across all pots
    const monthlyValueChange = pots.reduce((sum, pot) => {
      return sum + computeMonthlyValueChange(pot.valueHistory);
    }, 0);

    const totalCreditBalance = cards.reduce((s, c) => s + c.currentBalance, 0);
    const today = new Date().toISOString().split('T')[0];

    const overdueBills = bills
      .filter((b) => b.status !== 'paid' && b.due_date < today)
      .map((b) => ({ ...b, cardName: cards.find((c) => c.id === b.card_id)?.name ?? '' }));

    const upcomingBills = bills
      .filter((b) => b.status !== 'paid' && b.due_date >= today)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 3)
      .map((b) => ({ ...b, cardName: cards.find((c) => c.id === b.card_id)?.name ?? '' }));

    const totalAssets = totalPortfolioValue + shareValue;
    const totalLiabilities = totalCreditBalance;
    const netWorth = totalAssets - totalLiabilities;

    // Build portfolio history per account then combine
    const valuesByAccount: Record<string, typeof allValues> = {};
    for (const v of allValues) {
      if (!valuesByAccount[v.account_id]) valuesByAccount[v.account_id] = [];
      valuesByAccount[v.account_id].push(v);
    }
    const portfolioHistory = buildPortfolioHistory(valuesByAccount);
    const contributionHistory = buildMonthlyContributions(allContributions);

    // Net worth history = portfolio history (simplified; doesn't subtract liabilities over time)
    const netWorthHistory = portfolioHistory.map((p) => ({
      date: p.date,
      value: p.value + shareValue - totalLiabilities,
    }));

    return {
      totalPortfolioValue, totalContributions, totalGainLoss, totalReturnPercent,
      monthlyValueChange, shareValue, totalCreditBalance,
      overdueBills, upcomingBills, totalAssets, totalLiabilities, netWorth,
      portfolioHistory, contributionHistory, netWorthHistory,
    };
  }, [pots, holdings, cards, bills, allValues, allContributions]);

  if (loading) return <LoadingSpinner fullScreen message="Loading your finances..." />;

  const gainColor = metrics.totalGainLoss >= 0 ? 'text-emerald-600' : 'text-red-600';

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-lg mx-auto">
      <PageHeader title="Dashboard" />

      {/* Investment Summary */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <PiggyBank size={16} className="text-indigo-600" />
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Investments</h2>
        </div>
        <div className="mb-3">
          <p className="text-3xl font-bold text-slate-900">{formatCurrency(metrics.totalPortfolioValue)}</p>
          <p className="text-sm text-slate-500 mt-0.5">Total portfolio value</p>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-xs text-slate-500 mb-1">Contributions</p>
            <p className="text-base font-semibold text-slate-900">{formatCurrency(metrics.totalContributions)}</p>
          </div>
          <div className={`rounded-xl p-3 ${metrics.totalGainLoss >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
            <p className="text-xs text-slate-500 mb-1">Gain / Loss</p>
            <p className={`text-base font-semibold ${gainColor}`}>
              {formatChange(metrics.totalGainLoss)}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <div className="flex items-center gap-1.5">
            {metrics.totalGainLoss >= 0
              ? <TrendingUp size={14} className="text-emerald-500" />
              : <TrendingDown size={14} className="text-red-500" />}
            <span className={`text-sm font-semibold ${gainColor}`}>
              {formatPercent(metrics.totalReturnPercent)} total return
            </span>
          </div>
          <span className={`text-sm ${metrics.monthlyValueChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatChange(metrics.monthlyValueChange)} this month
          </span>
        </div>
      </Card>

      {/* Credit Card Summary */}
      {cards.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <CreditCard size={16} className="text-slate-600" />
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Credit Cards</h2>
          </div>
          <MetricRow label="Outstanding balance" value={formatCurrency(metrics.totalCreditBalance)} />
          {metrics.overdueBills.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {metrics.overdueBills.map((b) => (
                <div key={b.id} className="flex items-center justify-between bg-red-50 rounded-xl px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{b.cardName}</p>
                    <p className="text-xs text-red-600">{Math.abs(daysUntil(b.due_date))} days overdue</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-red-600">{formatCurrency(b.amount_due)}</p>
                    <Badge variant="red">Overdue</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
          {metrics.upcomingBills.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {metrics.upcomingBills.map((b) => {
                const bStatus = billStatusBadge(b.status);
                return (
                  <div key={b.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{b.cardName}</p>
                      <p className="text-xs text-slate-500">Due {formatDate(b.due_date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">{formatCurrency(b.amount_due)}</p>
                      <Badge variant={bStatus.variant}>{bStatus.label}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Net Worth */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Wallet size={16} className="text-slate-600" />
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Net Worth</h2>
        </div>
        <p className="text-3xl font-bold text-slate-900 mb-3">{formatCurrency(metrics.netWorth)}</p>
        <div className="space-y-0.5 border-t border-slate-100 pt-3">
          <MetricRow label="Investments" value={formatCurrency(metrics.totalPortfolioValue)} />
          {holdings.length > 0 && (
            <MetricRow label="Shares" value={formatCurrency(metrics.shareValue)} />
          )}
          <MetricRow label="Total assets" value={formatCurrency(metrics.totalAssets)} />
          <MetricRow
            label="Credit card debt"
            value={`−${formatCurrency(metrics.totalLiabilities)}`}
          />
        </div>
      </Card>

      {/* Quick Actions */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 size={16} className="text-slate-600" />
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setQuickAction('value')} size="sm">
            + Add value
          </Button>
          <Button variant="secondary" onClick={() => setQuickAction('contribution')} size="sm">
            + Add contribution
          </Button>
          <Button variant="secondary" onClick={() => setQuickAction('transaction')} size="sm">
            + Add share trade
          </Button>
          <Button variant="secondary" onClick={() => setQuickAction('bill')} size="sm">
            + Add card bill
          </Button>
        </div>
      </Card>

      {/* Charts */}
      {metrics.portfolioHistory.length >= 2 && (
        <Card>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Portfolio Value</h2>
          <ValueChart data={metrics.portfolioHistory} color="#6366f1" height={180} />
        </Card>
      )}

      {metrics.contributionHistory.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Monthly Contributions</h2>
          <ContributionChart data={metrics.contributionHistory} height={160} />
        </Card>
      )}

      {metrics.netWorthHistory.length >= 2 && (
        <Card>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Net Worth Over Time</h2>
          <ValueChart data={metrics.netWorthHistory} color="#8b5cf6" height={180} />
        </Card>
      )}

      {/* Quick Action Modals */}
      {quickAction === 'value' && (
        <AddValueModal
          pots={pots}
          onSave={addValue}
          onClose={() => setQuickAction(null)}
        />
      )}
      {quickAction === 'contribution' && (
        <AddContributionModal
          pots={pots}
          onSave={addContribution}
          onClose={() => setQuickAction(null)}
        />
      )}
      {quickAction === 'transaction' && holdings.length > 0 && (
        <AddTransactionModal
          holdings={holdings}
          onSave={addTransaction}
          onClose={() => setQuickAction(null)}
        />
      )}
      {quickAction === 'bill' && cards.length > 0 && (
        <AddBillModal
          cards={cards}
          onSave={addBill}
          onClose={() => setQuickAction(null)}
        />
      )}
    </div>
  );
}
