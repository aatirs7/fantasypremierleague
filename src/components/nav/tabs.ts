import { Home, Shirt, Trophy, Search, User, type LucideIcon } from 'lucide-react';

// Shared nav destinations, used by the mobile bottom bar and the desktop
// top bar so the two stay in sync.
export const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/squad', label: 'Squad', icon: Shirt },
  { href: '/league', label: 'League', icon: Trophy },
  { href: '/players', label: 'Players', icon: Search },
  { href: '/me', label: 'Me', icon: User },
];
