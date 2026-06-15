import { supabase } from '../lib/supabase';
import { CreditCard, CreditCardBill } from '../types';

export const creditCardsService = {
  async getCards(): Promise<CreditCard[]> {
    const { data, error } = await supabase
      .from('credit_cards')
      .select('*')
      .order('created_at');
    if (error) throw error;
    return data ?? [];
  },

  async getAllBills(): Promise<CreditCardBill[]> {
    const { data, error } = await supabase
      .from('credit_card_bills')
      .select('*')
      .order('due_date', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async addBill(
    cardId: string,
    statementDate: string,
    dueDate: string,
    amountDue: number,
    amountPaid: number,
    minimumPayment: number | null,
    status: CreditCardBill['status'],
    notes?: string
  ): Promise<void> {
    const { error } = await supabase.from('credit_card_bills').insert({
      card_id: cardId,
      statement_date: statementDate,
      due_date: dueDate,
      amount_due: amountDue,
      amount_paid: amountPaid,
      minimum_payment: minimumPayment,
      status,
      notes: notes || null,
    });
    if (error) throw error;
  },

  async updateBill(id: string, updates: Partial<CreditCardBill>): Promise<void> {
    const { error } = await supabase
      .from('credit_card_bills')
      .update(updates)
      .eq('id', id);
    if (error) throw error;
  },

  async markPaid(id: string, amountPaid: number): Promise<void> {
    const { error } = await supabase
      .from('credit_card_bills')
      .update({ status: 'paid', amount_paid: amountPaid })
      .eq('id', id);
    if (error) throw error;
  },

  async deleteBill(id: string): Promise<void> {
    const { error } = await supabase.from('credit_card_bills').delete().eq('id', id);
    if (error) throw error;
  },
};
