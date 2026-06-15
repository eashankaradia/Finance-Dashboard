type BadgeVariant = 'green' | 'red' | 'amber' | 'blue' | 'slate';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
}

const styles: Record<BadgeVariant, string> = {
  green: 'bg-emerald-50 text-emerald-700',
  red: 'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-700',
  blue: 'bg-indigo-50 text-indigo-700',
  slate: 'bg-slate-100 text-slate-600',
};

export function Badge({ children, variant = 'slate' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[variant]}`}>
      {children}
    </span>
  );
}

export function billStatusBadge(status: string) {
  switch (status) {
    case 'paid': return { label: 'Paid', variant: 'green' as BadgeVariant };
    case 'due_soon': return { label: 'Due Soon', variant: 'amber' as BadgeVariant };
    case 'overdue': return { label: 'Overdue', variant: 'red' as BadgeVariant };
    default: return { label: 'Unpaid', variant: 'slate' as BadgeVariant };
  }
}
