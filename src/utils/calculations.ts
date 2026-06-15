import { PotValueEntry, PotContribution, ShareTransaction } from '../types';

export function computePotMetrics(
  values: PotValueEntry[],
  contributions: PotContribution[]
) {
  const sortedValues = [...values].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const currentValue = sortedValues[0]?.value ?? 0;
  const lastUpdated = sortedValues[0]?.date ?? null;
  const totalContributions = contributions.reduce((sum, c) => sum + c.amount, 0);
  const gainLoss = currentValue - totalContributions;
  const returnPercent =
    totalContributions > 0 ? (gainLoss / totalContributions) * 100 : 0;

  return { currentValue, totalContributions, gainLoss, returnPercent, lastUpdated };
}

export function computeMonthlyValueChange(values: PotValueEntry[]): number {
  if (values.length < 2) return 0;

  const sorted = [...values].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0];

  const currentValue = sorted[0].value;
  // Find the last value entry on or before the start of this month
  const priorEntry = sorted.find((v) => v.date <= startOfMonth);
  if (!priorEntry) return 0;

  return currentValue - priorEntry.value;
}

// Uses average cost method. Prices stored in GBP.
export function computeShareMetrics(
  transactions: ShareTransaction[],
  currentPrice: number
) {
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  let sharesHeld = 0;
  let totalSharesBought = 0;
  let totalBuyCost = 0; // includes fees
  let realisedGainLoss = 0;

  for (const tx of sorted) {
    if (tx.type === 'buy') {
      sharesHeld += tx.quantity;
      totalSharesBought += tx.quantity;
      totalBuyCost += tx.quantity * tx.price + tx.fees;
    } else {
      const avgCost = totalSharesBought > 0 ? totalBuyCost / totalSharesBought : 0;
      const proceeds = tx.quantity * tx.price - tx.fees;
      realisedGainLoss += proceeds - tx.quantity * avgCost;
      sharesHeld -= tx.quantity;
    }
  }

  const averagePurchasePrice =
    totalSharesBought > 0 ? totalBuyCost / totalSharesBought : 0;
  const currentValue = sharesHeld * currentPrice;
  const unrealisedGainLoss = sharesHeld * (currentPrice - averagePurchasePrice);
  const totalInvested = totalBuyCost;
  const totalReturnPercent =
    totalInvested > 0
      ? ((currentValue + realisedGainLoss - totalInvested) / totalInvested) * 100
      : 0;

  return {
    sharesHeld,
    averagePurchasePrice,
    totalInvested,
    currentValue,
    realisedGainLoss,
    unrealisedGainLoss,
    totalReturnPercent,
  };
}

// Build combined portfolio value history by date across all pots
export function buildPortfolioHistory(
  valuesByAccount: Record<string, PotValueEntry[]>
): Array<{ date: string; value: number }> {
  const dateMap = new Map<string, number>();

  for (const entries of Object.values(valuesByAccount)) {
    for (const entry of entries) {
      dateMap.set(entry.date, (dateMap.get(entry.date) ?? 0) + entry.value);
    }
  }

  return Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}

// Aggregate contributions by month label (e.g. "Jan 25")
export function buildMonthlyContributions(
  contributions: PotContribution[]
): Array<{ date: string; amount: number }> {
  const monthMap = new Map<string, number>();

  for (const c of contributions) {
    const d = new Date(c.date + 'T00:00:00');
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthMap.set(key, (monthMap.get(key) ?? 0) + c.amount);
  }

  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount }));
}
