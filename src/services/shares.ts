import { supabase } from '../lib/supabase';
import { ShareHolding, ShareTransaction } from '../types';

export const sharesService = {
  async getHoldings(): Promise<ShareHolding[]> {
    const { data, error } = await supabase
      .from('share_holdings')
      .select('*')
      .order('created_at');
    if (error) throw error;
    return data ?? [];
  },

  async getAllTransactions(): Promise<ShareTransaction[]> {
    const { data, error } = await supabase
      .from('share_transactions')
      .select('*')
      .order('date');
    if (error) throw error;
    return data ?? [];
  },

  async addTransaction(
    holdingId: string,
    type: 'buy' | 'sell',
    date: string,
    quantity: number,
    price: number,
    fees: number,
    notes?: string
  ): Promise<void> {
    const { error } = await supabase.from('share_transactions').insert({
      holding_id: holdingId,
      type,
      date,
      quantity,
      price,
      fees,
      notes: notes || null,
    });
    if (error) throw error;
  },

  async updateTransaction(
    id: string,
    type: 'buy' | 'sell',
    date: string,
    quantity: number,
    price: number,
    fees: number,
    notes?: string
  ): Promise<void> {
    const { error } = await supabase
      .from('share_transactions')
      .update({ type, date, quantity, price, fees, notes: notes || null })
      .eq('id', id);
    if (error) throw error;
  },

  async deleteTransaction(id: string): Promise<void> {
    const { error } = await supabase.from('share_transactions').delete().eq('id', id);
    if (error) throw error;
  },
};
