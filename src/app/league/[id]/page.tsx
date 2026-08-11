import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { Swords, Trophy, Users } from 'lucide-react';
import { db } from '@/lib/db';
import { leagues } from '@/lib/schema';
import { readSession } from '@/lib/auth';
import { MIN_MANAGERS, isLeagueMember, leagueMemberList } from '@/lib/leagues';
import InviteShare from '@/components/leagues/InviteShare';
import LeagueStandings from '@/components/leagues/LeagueStandings';
import PLStandings from '@/components/matches/PLStandings';
import Countdown from '@/components/leagues/Countdown';
import ScheduleDraft from '@/components/leagues/ScheduleDraft';
import RememberLeague from '@/components/RememberLeague';
import Avatar from '@/components/Avatar';
import PullToRefresh from '@/components/PullToRefresh';

export const dynamic = 'force-dynamic';

export default async function LeaguePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view } = await searchParams;
  const showPl = view === 'pl';
  const session = await readSession();
  if (!session) redirect(`/?next=/league/${id}`);

  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1);
  if (!league) notFound();
  if (!(await isLeagueMember(session.userId, league.id))) notFound();

  const members = await leagueMemberList(league.id);
  const isOwner = league.ownerId === session.userId;
  const pending = league.draftStatus === 'pending';

  return (
    <div className="reveal space-y-4 py-4 lg:mx-auto lg:max-w-2xl">
      <PullToRefresh />
      <RememberLeague leagueId={league.id} />

      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(245,183,61,0.18), transparent 70%)' }}
        >
          <Trophy className="h-9 w-9 text-gold" strokeWidth={1.6} />
        </span>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{league.name}</h1>
          <p className="text-sm text-muted">2026-27 Season</p>
        </div>
        {league.isTest ? (
          <p className="inline-block rounded-full bg-gold/20 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-gold">
            Test mode
          </p>
        ) : null}
      </div>

      {!pending && league.draftStatus === 'complete' ? (
        <div className="flex justify-center gap-6 border-b border-edge">
          <Link href={`/league/${league.id}`} data-active={!showPl} className="tab-underline">
            Standings
          </Link>
          <Link href={`/league/${league.id}?view=pl`} data-active={showPl} className="tab-underline">
            PL Table
          </Link>
          <Link href={`/league/${league.id}/stats`} className="tab-underline">
            Stats
          </Link>
          <Link href={`/league/${league.id}/waivers`} className="tab-underline">
            Waivers
          </Link>
          <Link href={`/league/${league.id}/trades`} className="tab-underline">
            Trades
          </Link>
        </div>
      ) : null}

      {pending ? (
        <>
          <div className="card space-y-1 p-4 text-center">
            <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Draft</p>
            {league.draftTime ? (
              <>
                <p className="font-display text-3xl">
                  <Countdown toIso={league.draftTime.toISOString()} doneText="It is draft time" />
                </p>
                <p className="text-xs text-muted">
                  {new Date(league.draftTime).toLocaleString('en-US', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted">
                Not scheduled yet.{isOwner ? ' Pick a time below.' : ' The owner will pick a time.'}
              </p>
            )}
            <Link
              href={`/draft?league=${league.id}`}
              className="btn-primary mt-2 w-full"
            >
              <Swords className="h-4 w-4" />
              Enter draft room
            </Link>
            {members.length < MIN_MANAGERS ? (
              <p className="pt-1 text-xs text-muted">
                You need at least {MIN_MANAGERS} managers to draft. {members.length} joined so far.
              </p>
            ) : null}
          </div>
          {isOwner ? (
            <ScheduleDraft leagueId={league.id} currentIso={league.draftTime?.toISOString() ?? null} />
          ) : null}
          <InviteShare code={league.joinCode} leagueName={league.name} />
        </>
      ) : league.draftStatus === 'active' ? (
        <Link
          href={`/draft?league=${league.id}`}
          className="your-pick card flex min-h-14 items-center justify-center gap-2 p-4 text-lg font-bold active:scale-[0.99]"
        >
          <Swords className="h-5 w-5" />
          Draft is LIVE, jump in
        </Link>
      ) : showPl ? (
        <PLStandings />
      ) : (
        <>
          <LeagueStandings league={league} viewerId={session.userId} members={members} />
          <Link
            href={`/draft?league=${league.id}`}
            className="btn-outline mx-auto w-full max-w-xs"
          >
            View Draft Recap
          </Link>
        </>
      )}

      <div className="space-y-2">
        <p className="flex items-center justify-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
          <Users className="h-3.5 w-3.5" />
          Managers ({members.length})
        </p>
        {members.map((m) => (
          <div key={m.userId} className="card flex min-h-12 items-center gap-3 px-3 py-2">
            <Avatar name={m.username} size={32} />
            <span className="flex-1 truncate text-sm font-semibold">
              {m.username}
              {m.userId === session.userId ? (
                <span className="ml-2 rounded-full bg-accent px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider text-[var(--accent-ink)]">
                  You
                </span>
              ) : null}
              {m.isBot ? (
                <span className="ml-2 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider text-muted">
                  Bot
                </span>
              ) : null}
            </span>
            {m.userId === league.ownerId ? (
              <span className="text-[0.6rem] font-bold uppercase tracking-wider text-gold">Owner</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
