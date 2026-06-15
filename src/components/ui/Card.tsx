interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  padding?: boolean;
}

export function Card({ children, className = '', onClick, padding = true }: CardProps) {
  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border border-slate-100 ${
        padding ? 'p-4' : ''
      } ${
        onClick ? 'cursor-pointer active:scale-[0.98] transition-transform select-none' : ''
      } ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
