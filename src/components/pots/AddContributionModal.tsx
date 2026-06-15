import { useState, FormEvent } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';
import { AccountPot, PotContribution } from '../../types';
import { todayISO } from '../../utils/formatting';

interface Props {
  pots: AccountPot[];
  defaultPotId?: string;
  editEntry?: PotContribution;
  onSave: (accountId: string, amount: number, date: string, notes?: string) => Promise<void>;
  onUpdate?: (id: string, amount: number, date: string, notes?: string) => Promise<void>;
  onClose: () => void;
}

export function AddContributionModal({ pots, defaultPotId, editEntry, onSave, onUpdate, onClose }: Props) {
  const [accountId, setAccountId] = useState(editEntry ? editEntry.account_id : (defaultPotId ?? pots[0]?.id ?? ''));
  const [amount, setAmount] = useState(editEntry ? String(editEntry.amount) : '');
  const [date, setDate] = useState(editEntry ? editEntry.date : todayISO());
  const [notes, setNotes] = useState(editEntry?.notes ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) { setError('Please enter a positive amount'); return; }
    setLoading(true);
    setError(null);
    try {
      if (editEntry && onUpdate) {
        await onUpdate(editEntry.id, num, date, notes || undefined);
      } else {
        await onSave(accountId, num, date, notes || undefined);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
      setLoading(false);
    }
  }

  return (
    <Modal title={editEntry ? 'Edit Contribution' : 'Add Contribution'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {!editEntry && (
          <Select
            label="Account"
            value={accountId}
            onChange={setAccountId}
            options={pots.map((p) => ({ value: p.id, label: p.name }))}
            required
          />
        )}
        <Input
          label="Amount (£)"
          type="number"
          value={amount}
          onChange={setAmount}
          placeholder="0.00"
          min="0.01"
          step="0.01"
          required
        />
        <Input label="Date" type="date" value={date} onChange={setDate} required />
        <Input label="Notes (optional)" value={notes} onChange={setNotes} placeholder="e.g. Monthly contribution" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} fullWidth>Cancel</Button>
          <Button type="submit" loading={loading} fullWidth>Save</Button>
        </div>
      </form>
    </Modal>
  );
}
