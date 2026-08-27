import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  BarChart3,
  CalendarDays,
  ChevronRight,
  ListOrdered,
  Search,
  User,
} from 'lucide-react';
import { cookies } from 'next/headers';
import { readSession } from '@/lib/auth';
import { resolveActiveLeagueId } from '@/lib/leagues';
import Avatar from '@/components/Avatar';
import HowItWorks from '@/components/HowItWorks';
import PushToggle from '@/components/PushToggle';
import NoScroll from '@/components/NoScroll';
import { ThemeRow } from '@/components/ThemeButton';

export const dynamic = 'force-dynamic';

// The More tab: everything that does not need a permanent slot in the bar.
export default async function MorePage() {
  const session = await readSession();
  if (!session) redirect('/?next=/more');
  const leagueId = await resolveActiveLeagueId(session.userId);
  const theme = (await cookies()).get('epld_theme')?.value === 'light' ? 'light' : 'dark';

  const items = [
    { href: '/players', label: 'Players', sub: 'Scout all 577', icon: Search },
    { href: '/matches', label: 'Matches', sub: 'Fixtures and live scores', icon: CalendarDays },
    { href: '/matches?view=table', label: 'PL Table', sub: 'The real standings', icon: ListOrdered },
    ...(leagueId
      ? [{ href: `/league/${leagueId}/stats`, label: 'League Stats', sub: 'Records and MVP', icon: BarChart3 }]
      : []),
    { href: '/me', label: 'Profile', sub: 'Account and leagues', icon: User },
  ];

  return (
    <div className="reveal space-y-4 pb-4 pt-1 lg:mx-auto lg:max-w-2xl">
      <NoScroll />
      <Link href="/me" className="flex flex-col items-center gap-2 text-center">
        <Avatar name={session.username} size={48} />
        <span>
          <span className="block text-lg font-bold leading-tight">{session.username}</span>
          <span className="block text-xs text-muted">View profile</span>
        </span>
      </Link>

      <div className="card divide-y divide-[var(--line)] px-1.5">
        <HowItWorks trigger="row" />
        <PushToggle />
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="flex min-h-14 items-center gap-3 px-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
              <item.icon className="h-4.5 w-4.5" strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">{item.label}</span>
              <span className="block text-xs text-muted">{item.sub}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-2" />
          </Link>
        ))}
        <ThemeRow initial={theme} />
      </div>
    </div>
  );
}
