import { useState, useEffect, useCallback } from 'react';
import { sharesService } from '../services/shares';
import { marketDataService } from '../services/marketData';
import { ShareHolding, ShareTransaction, ComputedShareHolding, MarketQuote } from '../types';
import { computeShareMetrics } from '../utils/calculations';

export function useShares() {
  const [holdings, setHoldings] = useState<ShareHolding[]>([]);
  const [transactions, setTransactions] = useState<ShareTransaction[]>([]);
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [hdgs, txns] = await Promise.all([
        sharesService.getHoldings(),
        sharesService.getAllTransactions(),
      ]);
      setHoldings(hdgs);
      setTransactions(txns);

      if (hdgs.length > 0) {
        const fetchedQuotes = await marketDataService.getQuotes(hdgs.map((h) => h.ticker));
        setQuotes(fetchedQuotes);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load shares');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const computedHoldings: ComputedShareHolding[] = holdings.map((holding) => {
    const holdingTxns = transactions
      .filter((t) => t.holding_id === holding.id)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const currentPrice = quotes[holding.ticker]?.price ?? 0;
    const metrics = computeShareMetrics(holdingTxns, currentPrice);
    return { ...holding, ...metrics, currentPrice, transactions: holdingTxns };
  });

  return {
    holdings: computedHoldings,
    quotes,
    loading,
    error,
    refresh: fetchData,
    addTransaction: async (
      holdingId: string,
      type: 'buy' | 'sell',
      date: string,
      quantity: number,
      price: number,
      fees: number,
      notes?: string
    ) => {
      await sharesService.addTransaction(holdingId, type, date, quantity, price, fees, notes);
      await fetchData();
    },
    updateTransaction: async (
      id: string,
      type: 'buy' | 'sell',
      date: string,
      quantity: number,
      price: number,
      fees: number,
      notes?: string
    ) => {
      await sharesService.updateTransaction(id, type, date, quantity, price, fees, notes);
      await fetchData();
    },
    deleteTransaction: async (id: string) => {
      await sharesService.deleteTransaction(id);
      await fetchData();
    },
  };
}
