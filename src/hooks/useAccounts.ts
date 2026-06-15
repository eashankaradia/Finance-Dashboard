import { useState, useEffect, useCallback } from 'react';
import { accountsService } from '../services/accounts';
import { Account, PotValueEntry, PotContribution, AccountPot } from '../types';
import { computePotMetrics } from '../utils/calculations';

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allValues, setAllValues] = useState<PotValueEntry[]>([]);
  const [allContributions, setAllContributions] = useState<PotContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [accs, vals, contribs] = await Promise.all([
        accountsService.getAll(),
        accountsService.getAllValues(),
        accountsService.getAllContributions(),
      ]);
      setAccounts(accs);
      setAllValues(vals);
      setAllContributions(contribs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const pots: AccountPot[] = accounts.map((account) => {
    const values = allValues.filter((v) => v.account_id === account.id);
    const contributions = allContributions.filter((c) => c.account_id === account.id);
    const metrics = computePotMetrics(values, contributions);
    return {
      ...account,
      ...metrics,
      valueHistory: [...values].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      ),
      contributionHistory: [...contributions].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      ),
    };
  });

  const refresh = fetchData;

  return {
    pots,
    allValues,
    allContributions,
    loading,
    error,
    refresh,
    addValue: async (accountId: string, value: number, date: string, notes?: string) => {
      await accountsService.addValue(accountId, value, date, notes);
      await fetchData();
    },
    updateValue: async (id: string, value: number, date: string, notes?: string) => {
      await accountsService.updateValue(id, value, date, notes);
      await fetchData();
    },
    deleteValue: async (id: string) => {
      await accountsService.deleteValue(id);
      await fetchData();
    },
    addContribution: async (accountId: string, amount: number, date: string, notes?: string) => {
      await accountsService.addContribution(accountId, amount, date, notes);
      await fetchData();
    },
    updateContribution: async (id: string, amount: number, date: string, notes?: string) => {
      await accountsService.updateContribution(id, amount, date, notes);
      await fetchData();
    },
    deleteContribution: async (id: string) => {
      await accountsService.deleteContribution(id);
      await fetchData();
    },
    createAccount: async (name: string, description?: string) => {
      await accountsService.create(name, description);
      await fetchData();
    },
  };
}
