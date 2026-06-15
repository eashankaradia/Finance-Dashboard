export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCurrencyShort(amount: number): string {
  if (Math.abs(amount) >= 1000) {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
      notation: 'compact',
    }).format(amount);
  }
  return formatCurrency(amount);
}

export function formatPercent(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatChange(amount: number): string {
  const sign = amount >= 0 ? '+' : '';
  return `${sign}${formatCurrency(amount)}`;
}

export function formatDate(dateString: string): string {
  return new Date(dateString + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatShortDate(dateString: string): string {
  return new Date(dateString + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

export function formatMonthYear(dateString: string): string {
  return new Date(dateString + 'T00:00:00').toLocaleDateString('en-GB', {
    month: 'short',
    year: '2-digit',
  });
}

export function formatSharePrice(priceInGBP: number): string {
  // LLOY and similar LSE stocks trade in pence — display as pence
  const pence = priceInGBP * 100;
  if (pence < 100) {
    return `${pence.toFixed(2)}p`;
  }
  return formatCurrency(priceInGBP);
}

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function isOverdue(dueDateString: string): boolean {
  const due = new Date(dueDateString + 'T00:00:00');
  const today = new Date(todayISO() + 'T00:00:00');
  return due < today;
}

export function isDueSoon(dueDateString: string, days = 14): boolean {
  const due = new Date(dueDateString + 'T00:00:00');
  const today = new Date(todayISO() + 'T00:00:00');
  const diffMs = due.getTime() - today.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= days;
}

export function daysUntil(dueDateString: string): number {
  const due = new Date(dueDateString + 'T00:00:00');
  const today = new Date(todayISO() + 'T00:00:00');
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
