import { useState } from 'react';
import { Plus, CheckCircle2, CreditCard as CreditCardIcon, AlertCircle, Clock } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, billStatusBadge } from '../components/ui/Badge';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { AddBillModal } from '../components/creditcards/AddBillModal';
import { useCreditCards } from '../hooks/useCreditCards';
import { ComputedCreditCard, CreditCardBill } from '../types';
import { formatCurrency, formatDate, daysUntil } from '../utils/formatting';

function BillRow({
  bill,
  onMarkPaid,
  onEdit,
  onDelete,
}: {
  bill: CreditCardBill;
  onMarkPaid: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const bStatus = billStatusBadge(bill.status);
  const days = daysUntil(bill.due_date);
  const isPaid = bill.status === 'paid';

  return (
    <div className={`rounded-xl px-3 py-3 border ${isPaid ? 'bg-slate-50 border-slate-100' : bill.status === 'overdue' ? 'bg-red-50 border-red-100' : bill.status === 'due_soon' ? 'bg-amber-50 border-amber-100' : 'bg-white border-slate-100'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Badge variant={bStatus.variant}>{bStatus.label}</Badge>
            {!isPaid && days < 0 && (
              <span className="text-xs text-red-600">{Math.abs(days)}d overdue</span>
            )}
            {!isPaid && days >= 0 && days <= 14 && (
              <span className="text-xs text-amber-600">Due in {days}d</span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-900">{formatCurrency(bill.amount_due)}</p>
          <p className="text-xs text-slate-500">
            Statement {formatDate(bill.statement_date)} · Due {formatDate(bill.due_date)}
          </p>
          {bill.amount_paid > 0 && !isPaid && (
            <p className="text-xs text-emerald-600">Partial: {formatCurrency(bill.amount_paid)} paid</p>
          )}
          {isPaid && (
            <p className="text-xs text-emerald-600">Paid {formatCurrency(bill.amount_paid)}</p>
          )}
          {bill.notes && <p className="text-xs text-slate-400 mt-0.5 italic">{bill.notes}</p>}
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          {!isPaid && (
            <Button variant="secondary" size="sm" onClick={onMarkPaid}>
              <CheckCircle2 size={13} /> Paid
            </Button>
          )}
          <div className="flex gap-1">
            <button onClick={onEdit} className="text-xs text-indigo-600 hover:underline px-1">Edit</button>
            <button onClick={onDelete} className="text-xs text-red-500 hover:underline px-1">Del</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardSection({
  card,
  onAddBill,
  onMarkPaid,
  onEditBill,
  onDeleteBill,
}: {
  card: ComputedCreditCard;
  onAddBill: () => void;
  onMarkPaid: (billId: string, amount: number) => void;
  onEditBill: (bill: CreditCardBill) => void;
  onDeleteBill: (billId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? card.bills : card.bills.slice(0, 4);

  return (
    <Card padding={false} className="overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
              <CreditCardIcon size={14} className="text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">{card.name}</h3>
              {card.credit_limit && (
                <p className="text-xs text-slate-400">Limit: {formatCurrency(card.credit_limit)}</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className={`text-lg font-bold ${card.currentBalance > 0 ? 'text-slate-900' : 'text-emerald-600'}`}>
              {card.currentBalance > 0 ? formatCurrency(card.currentBalance) : 'Clear'}
            </p>
            <p className="text-xs text-slate-400">outstanding</p>
          </div>
        </div>

        <Button variant="secondary" size="sm" onClick={onAddBill} fullWidth>
          <Plus size={14} /> Add bill
        </Button>
      </div>

      {card.bills.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-2">
          {displayed.map((bill) => (
            <BillRow
              key={bill.id}
              bill={bill}
              onMarkPaid={() => onMarkPaid(bill.id, bill.amount_due)}
              onEdit={() => onEditBill(bill)}
              onDelete={() => onDeleteBill(bill.id)}
            />
          ))}
          {card.bills.length > 4 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-xs text-indigo-600 hover:underline w-full text-center py-1"
            >
              {showAll ? 'Show less' : `Show ${card.bills.length - 4} more`}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

export function CreditCardsPage() {
  const { cards, loading, error, addBill, updateBill, markPaid, deleteBill } = useCreditCards();
  const [showAdd, setShowAdd] = useState(false);
  const [editBill, setEditBill] = useState<CreditCardBill | null>(null);

  if (loading) return <LoadingSpinner fullScreen />;

  const totalBalance = cards.reduce((s, c) => s + c.currentBalance, 0);
  const allBills = cards.flatMap((c) => c.bills);
  const overdueBills = allBills.filter((b) => b.status === 'overdue');
  const dueSoonBills = allBills.filter((b) => b.status === 'due_soon');

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-lg mx-auto">
      <PageHeader
        title="Credit Cards"
        action={
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Bill
          </Button>
        }
      />

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Summary bar */}
      {cards.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <Card className="text-center">
            <p className="text-lg font-bold text-slate-900">{formatCurrency(totalBalance)}</p>
            <p className="text-xs text-slate-500">Outstanding</p>
          </Card>
          <Card className={`text-center ${overdueBills.length > 0 ? 'bg-red-50 border-red-100' : ''}`}>
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <AlertCircle size={14} className={overdueBills.length > 0 ? 'text-red-500' : 'text-slate-300'} />
              <p className={`text-lg font-bold ${overdueBills.length > 0 ? 'text-red-600' : 'text-slate-300'}`}>
                {overdueBills.length}
              </p>
            </div>
            <p className="text-xs text-slate-500">Overdue</p>
          </Card>
          <Card className={`text-center ${dueSoonBills.length > 0 ? 'bg-amber-50 border-amber-100' : ''}`}>
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Clock size={14} className={dueSoonBills.length > 0 ? 'text-amber-500' : 'text-slate-300'} />
              <p className={`text-lg font-bold ${dueSoonBills.length > 0 ? 'text-amber-600' : 'text-slate-300'}`}>
                {dueSoonBills.length}
              </p>
            </div>
            <p className="text-xs text-slate-500">Due soon</p>
          </Card>
        </div>
      )}

      {cards.length === 0 ? (
        <EmptyState
          icon={<CreditCardIcon size={40} />}
          title="No credit cards yet"
          description="Add sample data from Settings to get started."
        />
      ) : (
        cards.map((card) => (
          <CardSection
            key={card.id}
            card={card}
            onAddBill={() => setShowAdd(true)}
            onMarkPaid={(id, amount) => markPaid(id, amount)}
            onEditBill={(bill) => setEditBill(bill)}
            onDeleteBill={async (id) => {
              if (confirm('Delete this bill?')) await deleteBill(id);
            }}
          />
        ))
      )}

      {showAdd && cards.length > 0 && (
        <AddBillModal
          cards={cards}
          onSave={addBill}
          onClose={() => setShowAdd(false)}
        />
      )}
      {editBill && (
        <AddBillModal
          cards={cards}
          editEntry={editBill}
          onSave={addBill}
          onUpdate={updateBill}
          onClose={() => setEditBill(null)}
        />
      )}
    </div>
  );
}
