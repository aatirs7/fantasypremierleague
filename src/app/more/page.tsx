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
import { readSession } from '@/lib/auth';
import { resolveActiveLeagueId } from '@/lib/leagues';
import Avatar from '@/components/Avatar';

export const dynamic = 'force-dynamic';

// The More tab: everything that does not need a permanent slot in the bar.
export default async function MorePage() {
  const session = await readSession();
  if (!session) redirect('/?next=/more');
  const leagueId = await resolveActiveLeagueId(session.userId);

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
    <div className="reveal space-y-4 py-4 lg:mx-auto lg:max-w-2xl">
      <Link href="/me" className="flex items-center gap-3 px-1 pt-1">
        <Avatar name={session.username} size={44} />
        <span>
          <span className="block text-lg font-bold leading-tight">{session.username}</span>
          <span className="block text-xs text-muted">View profile</span>
        </span>
      </Link>

      <div className="card divide-y divide-[var(--line)] px-1.5">
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
      </div>
    </div>
  );
}
