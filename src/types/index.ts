// Core database row types — mirror the Supabase table columns exactly

export interface Account {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface PotValueEntry {
  id: string;
  account_id: string;
  value: number;
  date: string;
  notes?: string;
  created_at: string;
}

export interface PotContribution {
  id: string;
  account_id: string;
  amount: number;
  date: string;
  notes?: string;
  created_at: string;
}

// Account with computed metrics and full history
export interface AccountPot extends Account {
  currentValue: number;
  totalContributions: number;
  gainLoss: number;
  returnPercent: number;
  lastUpdated: string | null;
  valueHistory: PotValueEntry[];
  contributionHistory: PotContribution[];
}

export interface ShareHolding {
  id: string;
  ticker: string;
  name: string;
  created_at: string;
}

export interface ShareTransaction {
  id: string;
  holding_id: string;
  type: 'buy' | 'sell';
  date: string;
  quantity: number;
  price: number; // stored in GBP (e.g. £0.5724 for LLOY at 57.24p)
  fees: number;
  notes?: string;
  created_at: string;
}

// Holding with computed metrics and current market data
export interface ComputedShareHolding extends ShareHolding {
  sharesHeld: number;
  averagePurchasePrice: number;
  totalInvested: number;
  currentPrice: number;
  currentValue: number;
  realisedGainLoss: number;
  unrealisedGainLoss: number;
  totalReturnPercent: number;
  transactions: ShareTransaction[];
}

export interface CreditCard {
  id: string;
  name: string;
  credit_limit?: number;
  created_at: string;
}

export interface CreditCardBill {
  id: string;
  card_id: string;
  statement_date: string;
  due_date: string;
  amount_due: number;
  amount_paid: number;
  minimum_payment?: number;
  status: 'paid' | 'due_soon' | 'unpaid' | 'overdue';
  notes?: string;
  created_at: string;
}

// Card with computed balance and bill history
export interface ComputedCreditCard extends CreditCard {
  currentBalance: number;
  bills: CreditCardBill[];
  latestBill: CreditCardBill | null;
}

export interface MarketQuote {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  lastUpdated: string;
}

export interface DashboardMetrics {
  totalPortfolioValue: number;
  totalContributions: number;
  totalGainLoss: number;
  totalReturnPercent: number;
  monthlyValueChange: number;
  shareValue: number;
  totalCreditBalance: number;
  upcomingBills: Array<CreditCardBill & { cardName: string }>;
  overdueBills: Array<CreditCardBill & { cardName: string }>;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  portfolioHistory: Array<{ date: string; value: number }>;
  netWorthHistory: Array<{ date: string; value: number }>;
  contributionHistory: Array<{ date: string; amount: number }>;
}
