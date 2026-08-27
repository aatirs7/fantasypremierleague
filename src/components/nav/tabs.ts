import {
  Home,
  ArrowLeftRight,
  Shirt,
  Trophy,
  CalendarDays,
  Menu,
  type LucideIcon,
} from 'lucide-react';

// Shared by the mobile bottom bar and the desktop top bar.
//
// Market replaced Draft once drafting became a once-a-season event: waivers,
// trades and the free-agent pool are what you actually open every week. The
// draft room still lives at /draft and is linked from Home and the league.
export const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/market', label: 'Market', icon: ArrowLeftRight },
  { href: '/squad', label: 'My Team', icon: Shirt },
  { href: '/league', label: 'League', icon: Trophy },
  { href: '/matches', label: 'Matches', icon: CalendarDays },
  { href: '/more', label: 'More', icon: Menu },
];
