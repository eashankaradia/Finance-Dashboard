import { ArrowLeftRight, BarChart3, Home, Landmark, LineChart, Settings } from 'lucide-react';

export const NAV = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/accounts', label: 'Accounts', icon: Landmark },
  { href: '/holdings', label: 'Holdings', icon: LineChart },
  { href: '/activity', label: 'Activity', icon: ArrowLeftRight },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export const SECONDARY_NAV = [{ href: '/insights', label: 'Insights', icon: BarChart3 }] as const;

export function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}
