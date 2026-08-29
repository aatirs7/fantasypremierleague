import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { Swords, Trophy } from 'lucide-react';
import { db } from '@/lib/db';
import { leagues } from '@/lib/schema';
import { readSession } from '@/lib/auth';
import { MIN_MANAGERS, isLeagueMember, leagueMemberList } from '@/lib/leagues';
import InviteShare from '@/components/leagues/InviteShare';
import LeagueStandings from '@/components/leagues/LeagueStandings';
import PLStandings from '@/components/matches/PLStandings';
import H2HStandings from '@/components/leagues/H2HStandings';
import AwardsFeed from '@/components/leagues/AwardsFeed';
import LeagueStats from '@/components/leagues/LeagueStats';
import DraftGrades from '@/components/leagues/DraftGrades';
import DraftReportCard from '@/components/leagues/DraftReportCard';
import Countdown from '@/components/leagues/Countdown';
import ScheduleDraft from '@/components/leagues/ScheduleDraft';
import RememberLeague from '@/components/RememberLeague';
import LocalTime from '@/components/LocalTime';

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
    <div className="reveal space-y-4 pb-4 pt-1 lg:mx-auto lg:max-w-2xl">
      <RememberLeague leagueId={league.id} />

      <div className="flex flex-col items-center gap-2 text-center">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(245,183,61,0.18), transparent 70%)' }}
        >
          <Trophy className="h-9 w-9 text-gold" strokeWidth={1.6} />
        </span>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{league.name}</h1>
          <p className="text-sm text-muted">
            {league.season} Season
            {(league.startGw ?? 1) > 1 ? ` · from GW${league.startGw}` : ''}
          </p>
        </div>
        {league.isTest ? (
          <p className="inline-block rounded-full bg-gold/20 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-gold">
            Test mode
          </p>
        ) : null}
      </div>

      {!pending && league.draftStatus === 'complete' ? (
        <div className="border-b border-edge">
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-1">
            {(
              [
                ['', 'Head to head', view == null],
                ['?view=standings', 'Standings', view === 'standings' || view === 'points'],
                ['?view=grades', 'Draft', view === 'grades'],
                ['?view=pl', 'PL Table', showPl],
              ] as [string, string, boolean][]
            ).map(([suffix, label, active]) => (
              <Link
                key={label}
                href={`/league/${league.id}${suffix}`}
                data-active={active}
                className="tab-underline whitespace-nowrap"
              >
                {label}
              </Link>
            ))}
            <Link
              href={`/league/${league.id}?view=stats`}
              data-active={view === 'stats'}
              className="tab-underline whitespace-nowrap"
            >
              Stats
            </Link>
            <Link href={`/league/${league.id}/waivers`} className="tab-underline whitespace-nowrap">
              Waivers
            </Link>
            <Link href={`/league/${league.id}/trades`} className="tab-underline whitespace-nowrap">
              Trades
            </Link>
          </div>
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
                  <LocalTime iso={league.draftTime.toISOString()} mode="date-time" />
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
      ) : view === 'standings' || view === 'points' ? (
        <div className="space-y-4">
          <div className="flex justify-center gap-1.5">
            <Link
              href={`/league/${league.id}?view=standings`}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                view === 'standings'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-edge bg-white/[0.02] text-muted'
              }`}
            >
              Head to head
            </Link>
            <Link
              href={`/league/${league.id}?view=points`}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                view === 'points'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-edge bg-white/[0.02] text-muted'
              }`}
            >
              Points
            </Link>
          </div>
          {view === 'points' ? (
            <LeagueStandings league={league} viewerId={session.userId} members={members} />
          ) : (
            <H2HStandings leagueId={league.id} viewerId={session.userId} show="table" />
          )}
        </div>
      ) : view === 'grades' ? (
        <DraftGrades leagueId={league.id} viewerId={session.userId} />
      ) : view === 'stats' ? (
        <LeagueStats leagueId={league.id} />
      ) : (
        <>
          <DraftReportCard leagueId={league.id} viewerId={session.userId} />
          <H2HStandings leagueId={league.id} viewerId={session.userId} show="fixtures" />
          <AwardsFeed leagueId={league.id} />
        </>
      )}

    </div>
  );
}
