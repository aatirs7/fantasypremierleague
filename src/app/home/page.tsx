import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarClock, ChevronRight, Trophy } from 'lucide-react';
import { readSession } from '@/lib/auth';
import { myLeagues } from '@/lib/leagues';
import LeagueActions from '@/components/leagues/LeagueActions';
import Countdown from '@/components/leagues/Countdown';
import PullToRefresh from '@/components/PullToRefresh';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await readSession();
  if (!session) redirect('/?next=/home');
  const mine = await myLeagues(session.userId);

  return (
    <div className="reveal space-y-4 py-4 lg:mx-auto lg:max-w-2xl">
      <PullToRefresh />
      <div>
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">2026-27 season</p>
        <h1 className="font-display text-4xl">Hey, {session.username}</h1>
      </div>

      {mine.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">My leagues</p>
          {mine.map((l) => (
            <Link
              key={l.id}
              href={`/league/${l.id}`}
              className="card flex items-center gap-3 p-4 active:scale-[0.99]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 ring-1 ring-accent/30">
                <Trophy className="h-5 w-5 text-accent" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{l.name}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                  {l.draftStatus === 'pending' && l.draftTime ? (
                    <>
                      <CalendarClock className="h-3.5 w-3.5" />
                      Draft in <Countdown toIso={l.draftTime.toISOString()} doneText="Draft time!" />
                    </>
                  ) : l.draftStatus === 'pending' ? (
                    'Draft not scheduled yet'
                  ) : l.draftStatus === 'active' ? (
                    <span className="font-bold text-gold">Draft LIVE now</span>
                  ) : (
                    'Season underway'
                  )}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-2" />
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">
          You are not in a league yet. Join with a code from a friend, or start your own.
        </p>
      )}

      <LeagueActions />
    </div>
  );
}
