import { useState } from 'react';
import { TrendingUp, TrendingDown, Plus, ArrowUpCircle, ArrowDownCircle, RefreshCw } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { AddTransactionModal } from '../components/shares/AddTransactionModal';
import { useShares } from '../hooks/useShares';
import { ComputedShareHolding, ShareTransaction } from '../types';
import { formatCurrency, formatPercent, formatChange, formatDate, formatSharePrice } from '../utils/formatting';

function TransactionRow({ tx, onEdit, onDelete }: {
  tx: ShareTransaction;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isBuy = tx.type === 'buy';
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
      <div className="flex items-center gap-2.5">
        {isBuy
          ? <ArrowUpCircle size={18} className="text-emerald-500 flex-shrink-0" />
          : <ArrowDownCircle size={18} className="text-red-400 flex-shrink-0" />
        }
        <div>
          <p className="text-sm font-medium text-slate-900">
            {isBuy ? 'Buy' : 'Sell'} {tx.quantity.toLocaleString()} shares
          </p>
          <p className="text-xs text-slate-400">
            {formatDate(tx.date)} · {formatSharePrice(tx.price)} · fees {formatCurrency(tx.fees)}
          </p>
          {tx.notes && <p className="text-xs text-slate-400 italic">{tx.notes}</p>}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-semibold ${isBuy ? 'text-slate-900' : 'text-slate-900'}`}>
          {isBuy ? '−' : '+'}{formatCurrency(tx.quantity * tx.price + (isBuy ? tx.fees : -tx.fees))}
        </p>
        <div className="flex gap-1 justify-end mt-1">
          <button onClick={onEdit} className="text-xs text-indigo-600 hover:underline">Edit</button>
          <span className="text-slate-300">·</span>
          <button onClick={onDelete} className="text-xs text-red-500 hover:underline">Delete</button>
        </div>
      </div>
    </div>
  );
}

function HoldingCard({
  holding,
  onAdd,
  onDeleteTransaction,
  onUpdateTransaction,
}: {
  holding: ComputedShareHolding;
  onAdd: () => void;
  onDeleteTransaction: (id: string) => Promise<void>;
  onUpdateTransaction: (id: string, type: 'buy' | 'sell', date: string, quantity: number, price: number, fees: number, notes?: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editTx, setEditTx] = useState<ShareTransaction | null>(null);
  const gainColor = holding.unrealisedGainLoss >= 0 ? 'text-emerald-600' : 'text-red-600';
  const isUp = holding.unrealisedGainLoss >= 0;

  return (
    <Card padding={false} className="overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900 text-base">{holding.ticker}</h3>
              {isUp
                ? <TrendingUp size={14} className="text-emerald-500" />
                : <TrendingDown size={14} className="text-red-500" />}
            </div>
            <p className="text-sm text-slate-500">{holding.name}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-slate-900">{formatCurrency(holding.currentValue)}</p>
            <p className="text-xs text-slate-500">
              {formatSharePrice(holding.currentPrice)} per share
              {holding.currentPrice === 0 && <span className="text-amber-500 ml-1">(mock)</span>}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-xs text-slate-500">Shares held</p>
            <p className="text-sm font-semibold text-slate-900">{holding.sharesHeld.toLocaleString()}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-xs text-slate-500">Avg. cost</p>
            <p className="text-sm font-semibold text-slate-900">{formatSharePrice(holding.averagePurchasePrice)}</p>
          </div>
          <div className={`rounded-xl p-3 ${holding.unrealisedGainLoss >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
            <p className="text-xs text-slate-500">Unrealised G/L</p>
            <p className={`text-sm font-semibold ${gainColor}`}>
              {formatChange(holding.unrealisedGainLoss)}
            </p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-xs text-slate-500">Total return</p>
            <p className={`text-sm font-semibold ${gainColor}`}>
              {formatPercent(holding.totalReturnPercent)}
            </p>
          </div>
        </div>

        {holding.realisedGainLoss !== 0 && (
          <div className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2 mb-3">
            <span className="text-xs text-slate-500">Realised G/L</span>
            <span className={`text-sm font-semibold ${holding.realisedGainLoss >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatChange(holding.realisedGainLoss)}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Total invested: {formatCurrency(holding.totalInvested)}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onAdd}>
              <Plus size={14} /> Add trade
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Hide' : 'History'}
            </Button>
          </div>
        </div>
      </div>

      {expanded && holding.transactions.length > 0 && (
        <div className="border-t border-slate-100 px-4 pb-3 pt-1">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide py-2">
            Transaction history
          </p>
          {[...holding.transactions].reverse().map((tx) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              onEdit={() => setEditTx(tx)}
              onDelete={async () => {
                if (confirm('Delete this transaction?')) {
                  await onDeleteTransaction(tx.id);
                }
              }}
            />
          ))}
        </div>
      )}

      {editTx && (
        <AddTransactionModal
          holdings={[holding]}
          editEntry={editTx}
          onSave={async () => {}}
          onUpdate={onUpdateTransaction}
          onClose={() => setEditTx(null)}
        />
      )}
    </Card>
  );
}

export function SharesPage() {
  const { holdings, loading, error, refresh, addTransaction, deleteTransaction, updateTransaction } = useShares();
  const [showAdd, setShowAdd] = useState(false);

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-lg mx-auto">
      <PageHeader
        title="Shares"
        action={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={refresh}>
              <RefreshCw size={14} />
            </Button>
            {holdings.length > 0 && (
              <Button size="sm" onClick={() => setShowAdd(true)}>
                <Plus size={14} /> Trade
              </Button>
            )}
          </div>
        }
      />

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {holdings.length === 0 ? (
        <EmptyState
          icon={<TrendingUp size={40} />}
          title="No share holdings yet"
          description="Add sample data from Settings to see LLOY."
        />
      ) : (
        <>
          {/* Portfolio summary */}
          {holdings.length > 0 && (
            <Card className="bg-indigo-50 border-indigo-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-indigo-600 font-medium uppercase tracking-wide">Total Holdings</p>
                  <p className="text-xl font-bold text-indigo-900 mt-0.5">
                    {formatCurrency(holdings.reduce((s, h) => s + h.currentValue, 0))}
                  </p>
                </div>
                <Badge variant="blue">{holdings.length} holding{holdings.length !== 1 ? 's' : ''}</Badge>
              </div>
            </Card>
          )}

          {holdings.map((h) => (
            <HoldingCard
              key={h.id}
              holding={h}
              onAdd={() => setShowAdd(true)}
              onDeleteTransaction={deleteTransaction}
              onUpdateTransaction={updateTransaction}
            />
          ))}

          <p className="text-center text-xs text-slate-400 pb-2">
            Prices from mock provider. Connect a real API in services/marketData.ts.
          </p>
        </>
      )}

      {showAdd && holdings.length > 0 && (
        <AddTransactionModal
          holdings={holdings}
          onSave={addTransaction}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
