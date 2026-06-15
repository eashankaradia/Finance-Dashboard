import { useState, FormEvent } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';
import { AccountPot, PotValueEntry } from '../../types';
import { todayISO } from '../../utils/formatting';

interface Props {
  pots: AccountPot[];
  defaultPotId?: string;
  editEntry?: PotValueEntry;
  onSave: (accountId: string, value: number, date: string, notes?: string) => Promise<void>;
  onUpdate?: (id: string, value: number, date: string, notes?: string) => Promise<void>;
  onClose: () => void;
}

export function AddValueModal({ pots, defaultPotId, editEntry, onSave, onUpdate, onClose }: Props) {
  const [accountId, setAccountId] = useState(editEntry ? editEntry.account_id : (defaultPotId ?? pots[0]?.id ?? ''));
  const [value, setValue] = useState(editEntry ? String(editEntry.value) : '');
  const [date, setDate] = useState(editEntry ? editEntry.date : todayISO());
  const [notes, setNotes] = useState(editEntry?.notes ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) { setError('Please enter a valid value'); return; }
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
    <Modal title={editEntry ? 'Edit Value' : 'Add Value Update'} onClose={onClose}>
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
          label="Portfolio Value (£)"
          type="number"
          value={value}
          onChange={setValue}
          placeholder="0.00"
          min="0"
          step="0.01"
          required
          hint="Enter the total current value of this account"
        />
        <Input label="Date" type="date" value={date} onChange={setDate} required />
        <Input label="Notes (optional)" value={notes} onChange={setNotes} placeholder="Any notes about this update" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} fullWidth>Cancel</Button>
          <Button type="submit" loading={loading} fullWidth>Save</Button>
        </div>
      </form>
    </Modal>
  );
}
