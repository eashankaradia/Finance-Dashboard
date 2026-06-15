import { useState, FormEvent } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';
import { ComputedShareHolding, ShareTransaction } from '../../types';
import { todayISO } from '../../utils/formatting';

interface Props {
  holdings: ComputedShareHolding[];
  defaultHoldingId?: string;
  editEntry?: ShareTransaction;
  onSave: (holdingId: string, type: 'buy' | 'sell', date: string, quantity: number, price: number, fees: number, notes?: string) => Promise<void>;
  onUpdate?: (id: string, type: 'buy' | 'sell', date: string, quantity: number, price: number, fees: number, notes?: string) => Promise<void>;
  onClose: () => void;
}

export function AddTransactionModal({ holdings, defaultHoldingId, editEntry, onSave, onUpdate, onClose }: Props) {
  const [holdingId, setHoldingId] = useState(editEntry ? editEntry.holding_id : (defaultHoldingId ?? holdings[0]?.id ?? ''));
  const [type, setType] = useState<'buy' | 'sell'>(editEntry?.type ?? 'buy');
  const [date, setDate] = useState(editEntry ? editEntry.date : todayISO());
  const [quantity, setQuantity] = useState(editEntry ? String(editEntry.quantity) : '');
  const [price, setPrice] = useState(editEntry ? String(editEntry.price * 100) : ''); // display in pence
  const [fees, setFees] = useState(editEntry ? String(editEntry.fees) : '11.95');
  const [notes, setNotes] = useState(editEntry?.notes ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const qty = parseFloat(quantity);
    const priceGBP = parseFloat(price) / 100; // convert pence to GBP for storage
    const feesNum = parseFloat(fees) || 0;
    if (isNaN(qty) || qty <= 0) { setError('Enter a valid quantity'); return; }
    if (isNaN(priceGBP) || priceGBP <= 0) { setError('Enter a valid price'); return; }
    setLoading(true);
    setError(null);
    try {
      if (editEntry && onUpdate) {
        await onUpdate(editEntry.id, type, date, qty, priceGBP, feesNum, notes || undefined);
      } else {
        await onSave(holdingId, type, date, qty, priceGBP, feesNum, notes || undefined);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
      setLoading(false);
    }
  }

  return (
    <Modal title={editEntry ? 'Edit Transaction' : 'Add Share Transaction'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {!editEntry && (
          <Select
            label="Holding"
            value={holdingId}
            onChange={setHoldingId}
            options={holdings.map((h) => ({ value: h.id, label: `${h.ticker} — ${h.name}` }))}
            required
          />
        )}
        <Select
          label="Transaction type"
          value={type}
          onChange={(v) => setType(v as 'buy' | 'sell')}
          options={[{ value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }]}
        />
        <Input label="Date" type="date" value={date} onChange={setDate} required />
        <Input
          label="Quantity (shares)"
          type="number"
          value={quantity}
          onChange={setQuantity}
          placeholder="1000"
          min="0.0001"
          step="0.0001"
          required
        />
        <Input
          label="Price per share (pence)"
          type="number"
          value={price}
          onChange={setPrice}
          placeholder="57.24"
          min="0.01"
          step="0.01"
          required
          hint="Enter price in pence, e.g. 57.24 for 57.24p"
        />
        <Input
          label="Fees (£)"
          type="number"
          value={fees}
          onChange={setFees}
          placeholder="11.95"
          min="0"
          step="0.01"
        />
        <Input label="Notes (optional)" value={notes} onChange={setNotes} placeholder="e.g. Regular investment" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} fullWidth>Cancel</Button>
          <Button type="submit" loading={loading} fullWidth>Save</Button>
        </div>
      </form>
    </Modal>
  );
}
