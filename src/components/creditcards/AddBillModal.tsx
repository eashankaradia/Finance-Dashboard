import { useState, FormEvent } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';
import { ComputedCreditCard, CreditCardBill } from '../../types';
import { todayISO } from '../../utils/formatting';

interface Props {
  cards: ComputedCreditCard[];
  defaultCardId?: string;
  editEntry?: CreditCardBill;
  onSave: (cardId: string, statementDate: string, dueDate: string, amountDue: number, amountPaid: number, minimumPayment: number | null, status: CreditCardBill['status'], notes?: string) => Promise<void>;
  onUpdate?: (id: string, updates: Partial<CreditCardBill>) => Promise<void>;
  onClose: () => void;
}

export function AddBillModal({ cards, defaultCardId, editEntry, onSave, onUpdate, onClose }: Props) {
  const [cardId, setCardId] = useState(editEntry ? editEntry.card_id : (defaultCardId ?? cards[0]?.id ?? ''));
  const [statementDate, setStatementDate] = useState(editEntry?.statement_date ?? todayISO());
  const [dueDate, setDueDate] = useState(editEntry?.due_date ?? todayISO());
  const [amountDue, setAmountDue] = useState(editEntry ? String(editEntry.amount_due) : '');
  const [amountPaid, setAmountPaid] = useState(editEntry ? String(editEntry.amount_paid) : '0');
  const [minimumPayment, setMinimumPayment] = useState(editEntry?.minimum_payment ? String(editEntry.minimum_payment) : '25');
  const [status, setStatus] = useState<CreditCardBill['status']>(editEntry?.status ?? 'unpaid');
  const [notes, setNotes] = useState(editEntry?.notes ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const due = parseFloat(amountDue);
    const paid = parseFloat(amountPaid) || 0;
    const min = parseFloat(minimumPayment) || null;
    if (isNaN(due) || due < 0) { setError('Enter a valid amount due'); return; }
    setLoading(true);
    setError(null);
    try {
      if (editEntry && onUpdate) {
        await onUpdate(editEntry.id, {
          card_id: cardId, statement_date: statementDate, due_date: dueDate,
          amount_due: due, amount_paid: paid, minimum_payment: min ?? undefined,
          status, notes: notes || undefined,
        });
      } else {
        await onSave(cardId, statementDate, dueDate, due, paid, min, status, notes || undefined);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
      setLoading(false);
    }
  }

  return (
    <Modal title={editEntry ? 'Edit Bill' : 'Add Credit Card Bill'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {!editEntry && (
          <Select
            label="Card"
            value={cardId}
            onChange={setCardId}
            options={cards.map((c) => ({ value: c.id, label: c.name }))}
            required
          />
        )}
        <Input label="Statement date" type="date" value={statementDate} onChange={setStatementDate} required />
        <Input label="Due date" type="date" value={dueDate} onChange={setDueDate} required />
        <Input label="Amount due (£)" type="number" value={amountDue} onChange={setAmountDue} placeholder="0.00" min="0" step="0.01" required />
        <Input label="Amount paid (£)" type="number" value={amountPaid} onChange={setAmountPaid} placeholder="0.00" min="0" step="0.01" />
        <Input label="Minimum payment (£)" type="number" value={minimumPayment} onChange={setMinimumPayment} placeholder="25.00" min="0" step="0.01" />
        <Select
          label="Status"
          value={status}
          onChange={(v) => setStatus(v as CreditCardBill['status'])}
          options={[
            { value: 'unpaid', label: 'Unpaid' },
            { value: 'due_soon', label: 'Due Soon' },
            { value: 'overdue', label: 'Overdue' },
            { value: 'paid', label: 'Paid' },
          ]}
        />
        <Input label="Notes (optional)" value={notes} onChange={setNotes} placeholder="Any notes" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} fullWidth>Cancel</Button>
          <Button type="submit" loading={loading} fullWidth>Save</Button>
        </div>
      </form>
    </Modal>
  );
}
