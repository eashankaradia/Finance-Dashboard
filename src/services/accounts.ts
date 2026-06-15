import { supabase } from '../lib/supabase';
import { Account, PotValueEntry, PotContribution } from '../types';

export const accountsService = {
  async getAll(): Promise<Account[]> {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .order('created_at');
    if (error) throw error;
    return data ?? [];
  },

  async getAllValues(): Promise<PotValueEntry[]> {
    const { data, error } = await supabase
      .from('account_values')
      .select('*')
      .order('date');
    if (error) throw error;
    return data ?? [];
  },

  async getAllContributions(): Promise<PotContribution[]> {
    const { data, error } = await supabase
      .from('contributions')
      .select('*')
      .order('date');
    if (error) throw error;
    return data ?? [];
  },

  async addValue(accountId: string, value: number, date: string, notes?: string): Promise<void> {
    const { error } = await supabase
      .from('account_values')
      .insert({ account_id: accountId, value, date, notes: notes || null });
    if (error) throw error;
  },

  async updateValue(id: string, value: number, date: string, notes?: string): Promise<void> {
    const { error } = await supabase
      .from('account_values')
      .update({ value, date, notes: notes || null })
      .eq('id', id);
    if (error) throw error;
  },

  async deleteValue(id: string): Promise<void> {
    const { error } = await supabase.from('account_values').delete().eq('id', id);
    if (error) throw error;
  },

  async addContribution(accountId: string, amount: number, date: string, notes?: string): Promise<void> {
    const { error } = await supabase
      .from('contributions')
      .insert({ account_id: accountId, amount, date, notes: notes || null });
    if (error) throw error;
  },

  async updateContribution(id: string, amount: number, date: string, notes?: string): Promise<void> {
    const { error } = await supabase
      .from('contributions')
      .update({ amount, date, notes: notes || null })
      .eq('id', id);
    if (error) throw error;
  },

  async deleteContribution(id: string): Promise<void> {
    const { error } = await supabase.from('contributions').delete().eq('id', id);
    if (error) throw error;
  },

  async create(name: string, description?: string): Promise<Account> {
    const { data, error } = await supabase
      .from('accounts')
      .insert({ name, description: description || null })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};
