import { Home, Swords, Shirt, Trophy, CalendarDays, Menu, type LucideIcon } from 'lucide-react';

// Shared by the mobile bottom bar and the desktop top bar.
export const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/draft', label: 'Draft', icon: Swords },
  { href: '/squad', label: 'My Team', icon: Shirt },
  { href: '/league', label: 'League', icon: Trophy },
  { href: '/matches', label: 'Matches', icon: CalendarDays },
  { href: '/more', label: 'More', icon: Menu },
];
