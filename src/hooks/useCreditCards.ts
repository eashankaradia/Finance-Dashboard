import { useState, useEffect, useCallback } from 'react';
import { creditCardsService } from '../services/creditCards';
import { CreditCard, CreditCardBill, ComputedCreditCard } from '../types';

export function useCreditCards() {
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [bills, setBills] = useState<CreditCardBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [cardData, billData] = await Promise.all([
        creditCardsService.getCards(),
        creditCardsService.getAllBills(),
      ]);
      setCards(cardData);
      setBills(billData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load credit cards');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const computedCards: ComputedCreditCard[] = cards.map((card) => {
    const cardBills = bills
      .filter((b) => b.card_id === card.id)
      .sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime());
    const latestBill = cardBills[0] ?? null;
    const currentBalance =
      latestBill && latestBill.status !== 'paid'
        ? Math.max(0, latestBill.amount_due - latestBill.amount_paid)
        : 0;
    return { ...card, currentBalance, bills: cardBills, latestBill };
  });

  return {
    cards: computedCards,
    bills,
    loading,
    error,
    refresh: fetchData,
    addBill: async (
      cardId: string,
      statementDate: string,
      dueDate: string,
      amountDue: number,
      amountPaid: number,
      minimumPayment: number | null,
      status: CreditCardBill['status'],
      notes?: string
    ) => {
      await creditCardsService.addBill(
        cardId, statementDate, dueDate, amountDue, amountPaid, minimumPayment, status, notes
      );
      await fetchData();
    },
    updateBill: async (id: string, updates: Partial<CreditCardBill>) => {
      await creditCardsService.updateBill(id, updates);
      await fetchData();
    },
    markPaid: async (id: string, amountPaid: number) => {
      await creditCardsService.markPaid(id, amountPaid);
      await fetchData();
    },
    deleteBill: async (id: string) => {
      await creditCardsService.deleteBill(id);
      await fetchData();
    },
  };
}
