import { NavLink } from 'react-router-dom';
import { LayoutDashboard, PiggyBank, TrendingUp, CreditCard, Settings } from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', Icon: LayoutDashboard, exact: true },
  { path: '/pots', label: 'Pots', Icon: PiggyBank, exact: false },
  { path: '/shares', label: 'Shares', Icon: TrendingUp, exact: false },
  { path: '/cards', label: 'Cards', Icon: CreditCard, exact: false },
  { path: '/settings', label: 'Settings', Icon: Settings, exact: false },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40 safe-bottom">
      <div className="flex h-16">
        {NAV_ITEMS.map(({ path, label, Icon, exact }) => (
          <NavLink
            key={path}
            to={path}
            end={exact}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${
                isActive ? 'text-indigo-600' : 'text-slate-400'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
