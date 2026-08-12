import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  ChevronRight,
  Search,
  Shirt,
  Swords,
  Trophy,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { db } from '@/lib/db';
import {
  draftPicks,
  fixtures,
  gameweeks,
  gwScores,
  leagueMembers,
  leagues,
  lineups,
  squads,
  standingSnapshots,
  users,
} from '@/lib/schema';
import { readSession } from '@/lib/auth';
import { editableGw } from '@/lib/lineup';
import { leagueTable } from '@/lib/scoring';
import { myLeagues, resolveActiveLeagueId } from '@/lib/leagues';
import LeagueActions from '@/components/leagues/LeagueActions';
import Countdown, { CountdownBlocks } from '@/components/leagues/Countdown';
import RememberLeague from '@/components/RememberLeague';
import PullToRefresh from '@/components/PullToRefresh';

export const dynamic = 'force-dynamic';

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'America/New_York',
    }).format(new Date()),
  );
  if (hour < 5) return 'Good night,';
  if (hour < 12) return 'Good morning,';
  if (hour < 18) return 'Good afternoon,';
  return 'Good evening,';
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const session = await readSession();
  if (!session) redirect('/?next=/home');
  const { league: requested } = await searchParams;
  const mine = await myLeagues(session.userId);

  if (mine.length === 0) {
    return (
      <div className="reveal mx-auto max-w-md space-y-6 py-6">
        <header className="text-center">
          <p className="text-sm text-muted">{greeting()}</p>
          <h1 className="text-2xl font-bold tracking-tight">{session.username}</h1>
        </header>
        <p className="px-1 text-center text-sm text-muted">
          Join a friend&apos;s league with their code, or start your own and share it.
        </p>
        <LeagueActions />
      </div>
    );
  }

  const activeId = (await resolveActiveLeagueId(session.userId, requested)) ?? mine[0].id;
  const [active] = await db.select().from(leagues).where(eq(leagues.id, activeId)).limit(1);
  const [mySquad] = await db
    .select()
    .from(squads)
    .where(and(eq(squads.leagueId, activeId), eq(squads.userId, session.userId)))
    .limit(1);
  const [memberCountRow] = await db
    .select({ userId: leagueMembers.userId })
    .from(leagueMembers)
    .where(eq(leagueMembers.leagueId, activeId))
    .then((rows) => [{ n: rows.length }]);
  const teamCount = memberCountRow?.n ?? 0;

  const nextGw = await editableGw();
  const [currentGw] = await db
    .select({ gw: gameweeks.gw })
    .from(gameweeks)
    .where(eq(gameweeks.isCurrent, true))
    .limit(1);

  // Any match live right now, for the live card.
  const liveFixtures = await db
    .select()
    .from(fixtures)
    .where(and(eq(fixtures.started, true), eq(fixtures.finished, false)))
    .limit(3);
  const liveClubIds = [
    ...new Set(liveFixtures.flatMap((f) => [f.homeClub, f.awayClub])),
  ];
  const liveClubs = liveClubIds.length
    ? await db
        .selectDistinct({ clubId: sqlFplId.clubId, clubShort: sqlFplId.clubShort })
        .from(sqlFplId)
        .where(inArray(sqlFplId.clubId, liveClubIds))
    : [];
  const liveClubShort = new Map(liveClubs.map((c) => [c.clubId, c.clubShort]));

  const teamName = mySquad?.name ?? `${session.username} FC`;

  // Formation string from the current editable lineup, e.g. 4-3-3.
  let formation: string | null = null;
  if (mySquad && nextGw) {
    const [lineup] = await db
      .select()
      .from(lineups)
      .where(and(eq(lineups.squadId, mySquad.id), eq(lineups.gw, nextGw.gw)))
      .limit(1);
    if (lineup) {
      const ids = lineup.picks.filter((p) => p.starting).map((p) => p.fplId);
      const posRows = ids.length
        ? await db
            .select({ fplId: sqlFplId.fplId, position: sqlFplId.position })
            .from(sqlFplId)
            .where(inArray(sqlFplId.fplId, ids))
        : [];
      const c: Record<string, number> = { DEF: 0, MID: 0, FWD: 0 };
      for (const r of posRows) if (r.position in c) c[r.position]++;
      formation = `${c.DEF}-${c.MID}-${c.FWD}`;
    }
  }

  let myRank: number | null = null;
  let fieldSize = 0;
  let seasonPoints = 0;
  let gwPoints: number | null = null;
  let gwLive = false;
  if (active?.draftStatus === 'complete') {
    const table = await leagueTable(activeId, currentGw?.gw ?? null);
    fieldSize = table.length;
    const me = table.find((r) => r.userId === session.userId);
    if (me) {
      myRank = me.rank;
      seasonPoints = me.seasonTotal;
      gwPoints = me.currentGwPoints;
      gwLive = me.currentGwLive;
    }
  }
  void seasonPoints;
  if (mySquad && gwPoints == null) {
    const [latest] = await db
      .select({ totalPoints: gwScores.totalPoints, final: gwScores.final })
      .from(gwScores)
      .where(eq(gwScores.squadId, mySquad.id))
      .orderBy(desc(gwScores.gw))
      .limit(1);
    if (latest) {
      gwPoints = latest.totalPoints;
      gwLive = !latest.final;
    }
  }

  // My first draft pick, for the Last Draft card.
  let firstPick: string | null = null;
  if (active?.draftStatus === 'complete') {
    const [fp] = await db
      .select({ fplId: draftPicks.fplId })
      .from(draftPicks)
      .where(and(eq(draftPicks.leagueId, activeId), eq(draftPicks.userId, session.userId)))
      .orderBy(draftPicks.pickNumber)
      .limit(1);
    if (fp) {
      const [p] = await db
        .select({ webName: sqlFplId.webName })
        .from(sqlFplId)
        .where(eq(sqlFplId.fplId, fp.fplId))
        .limit(1);
      firstPick = p?.webName ?? null;
    }
  }

  // Recap: movement since this gameweek's baseline snapshot.
  type Recap = {
    you: { rank: number; rankDelta: number; gained: number } | null;
    climber: { name: string; up: number } | null;
    gainer: { name: string; pts: number } | null;
  };
  let recap: Recap | null = null;
  if (active?.draftStatus === 'complete') {
    const snaps = await db
      .select()
      .from(standingSnapshots)
      .where(eq(standingSnapshots.leagueId, activeId));
    if (snaps.length) {
      const table = await leagueTable(activeId, currentGw?.gw ?? null);
      const combined = new Map(
        table.map((r) => [
          r.userId,
          r.seasonTotal + (r.currentGwLive ? (r.currentGwPoints ?? 0) : 0),
        ]),
      );
      const rankNow = new Map(table.map((r) => [r.userId, r.rank]));
      const nameRows = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(inArray(users.id, snaps.map((s) => s.userId)));
      const nameOf = new Map(nameRows.map((n) => [n.id, n.username]));

      let climber: Recap['climber'] = null;
      let climberTies = 0;
      let gainer: Recap['gainer'] = null;
      let gainerTies = 0;
      for (const s of snaps) {
        if (s.userId === session.userId) continue;
        const up = s.rank != null ? s.rank - (rankNow.get(s.userId) ?? s.rank) : 0;
        const gained = (combined.get(s.userId) ?? s.points) - s.points;
        if (up > 0) {
          if (!climber || up > climber.up) {
            climber = { name: nameOf.get(s.userId) ?? '?', up };
            climberTies = 1;
          } else if (up === climber.up) climberTies++;
        }
        if (gained > 0) {
          if (!gainer || gained > gainer.pts) {
            gainer = { name: nameOf.get(s.userId) ?? '?', pts: gained };
            gainerTies = 1;
          } else if (gained === gainer.pts) gainerTies++;
        }
      }
      const mySnap = snaps.find((s) => s.userId === session.userId);
      const you =
        mySnap && rankNow.has(session.userId)
          ? {
              rank: rankNow.get(session.userId)!,
              rankDelta: mySnap.rank != null ? mySnap.rank - rankNow.get(session.userId)! : 0,
              gained: (combined.get(session.userId) ?? mySnap.points) - mySnap.points,
            }
          : null;
      const built: Recap = {
        you,
        climber: climberTies === 1 ? climber : null,
        gainer: gainerTies === 1 ? gainer : null,
      };
      if (built.you?.rankDelta || built.you?.gained || built.climber || built.gainer) {
        recap = built;
      }
    }
  }

  return (
    <div className="space-y-4 py-2 lg:mx-auto lg:max-w-2xl">
      <PullToRefresh />
      <RememberLeague leagueId={activeId} />

      <header className="reveal pb-1 pt-1 text-center">
        <p className="text-[0.58rem] font-medium uppercase tracking-[0.22em] text-muted-2">
          {greeting().replace(',', '')}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{session.username}</h1>
      </header>

      {mine.length > 1 ? (
        <div className="-mx-4 overflow-x-auto px-4">
          <div className="flex w-max gap-1.5">
            {mine.map((l) => (
              <Link
                key={l.id}
                href={`/home?league=${l.id}`}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                  l.id === activeId
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-edge bg-white/[0.02] text-muted'
                }`}
              >
                {l.name}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* Live matches card. */}
      {liveFixtures.length ? (
        <Link
          href={liveFixtures.length === 1 ? `/matches/${liveFixtures[0].fplFixtureId}` : '/matches'}
          className="tile reveal flex flex-col items-center gap-1.5 p-4 text-center active:scale-[0.99]"
        >
          <span className="flex items-center gap-1.5 text-[0.58rem] font-medium uppercase tracking-[0.22em] text-live">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-live" />
            Live now
          </span>
          {liveFixtures.map((f) => (
            <span key={f.fplFixtureId} className="text-lg font-semibold tracking-tight tabular-nums">
              {liveClubShort.get(f.homeClub) ?? '?'} {f.homeScore ?? 0} - {f.awayScore ?? 0}{' '}
              {liveClubShort.get(f.awayClub) ?? '?'}
            </span>
          ))}
          <span className="text-xs text-muted">
            {liveFixtures.length === 1 ? 'Open match' : 'All live matches'}
          </span>
        </Link>
      ) : null}

      {/* Gameweek panel. */}
      {nextGw ? (
        <section className="hero-gw reveal px-5 pb-4 pt-5 text-center" style={{ animationDelay: '40ms' }}>
          <p className="text-[0.58rem] font-medium uppercase tracking-[0.22em] text-muted-2">
            {active?.draftStatus === 'complete' ? 'Next deadline' : 'Season opener'}
          </p>
          <p className="mt-1 text-xl font-semibold tracking-tight">Gameweek {nextGw.gw}</p>
          <div className="mb-4 mt-4">
            <CountdownBlocks toIso={nextGw.deadline.toISOString()} doneText="Underway" />
          </div>
          <Link
            href="/matches"
            className="flex items-center justify-center gap-1 border-t border-edge pt-3 text-sm font-medium text-muted"
          >
            View fixtures
            <ChevronRight className="h-4 w-4" />
          </Link>
        </section>
      ) : null}

      {/* Season stat strip, once the league has drafted. */}
      {active?.draftStatus === 'complete' ? (
        <section className="reveal grid grid-cols-3 gap-2.5" style={{ animationDelay: '60ms' }}>
          {(
            [
              ['Rank', myRank ? ordinal(myRank) : '-', myRank ? `of ${fieldSize}` : 'no scores yet'],
              ['Points', String(seasonPoints), 'season'],
              [
                'This GW',
                gwPoints != null ? String(gwPoints) : '-',
                gwLive ? 'live now' : 'confirmed',
              ],
            ] as [string, string, string][]
          ).map(([label, value, sub], i) => (
            <div key={label} className="tile px-2 py-3 text-center">
              <p className="text-[0.55rem] font-medium uppercase tracking-[0.18em] text-muted-2">
                {label}
              </p>
              <p
                className={`mt-1 text-2xl font-semibold leading-none tracking-tight ${
                  i === 2 && gwLive ? 'text-live' : ''
                }`}
              >
                {value}
              </p>
              <p className="mt-1 text-[0.6rem] text-muted-2">{sub}</p>
            </div>
          ))}
        </section>
      ) : null}

      {/* Draft state card (pre-draft / live). */}
      {active?.draftStatus === 'pending' ? (
        <section className="tile reveal space-y-3 p-4 text-center" style={{ animationDelay: '70ms' }}>
          <p className="text-[0.58rem] font-medium uppercase tracking-[0.22em] text-muted-2">
            Draft night
          </p>
          <p className="text-lg font-semibold tracking-tight">
            {active.draftTime ? (
              <>
                Starts in{' '}
                <span className="text-accent">
                  <Countdown toIso={active.draftTime.toISOString()} doneText="now" />
                </span>
              </>
            ) : (
              'Not scheduled yet'
            )}
          </p>
          <Link href={`/draft?league=${activeId}`} className="btn-primary w-full">
            <Swords className="h-4 w-4" />
            Enter Draft Room
          </Link>
        </section>
      ) : active?.draftStatus === 'active' ? (
        <Link
          href={`/draft?league=${activeId}`}
          className="btn-primary reveal w-full"
          style={{ animationDelay: '70ms' }}
        >
          <Swords className="h-5 w-5" />
          Draft is LIVE, jump in
        </Link>
      ) : null}

      {/* Square tiles, two across, so the dashboard fits without scrolling. */}
      <section className="reveal grid grid-cols-2 gap-3" style={{ animationDelay: '100ms' }}>
        <Link
          href="/squad"
          className="tile flex aspect-square flex-col justify-between p-4 active:scale-[0.98]"
        >
          <Shirt className="h-5 w-5 text-muted-2" strokeWidth={1.8} />
          <span className="min-w-0">
            <span className="block text-[0.58rem] font-medium uppercase tracking-[0.16em] text-muted-2">
              My Team
            </span>
            <span className="mt-1 block truncate text-base font-semibold tracking-tight">
              {teamName}
            </span>
            <span className="block truncate text-xs text-muted">
              {formation ?? (active?.draftStatus === 'complete' ? 'Set your lineup' : 'Drafts soon')}
            </span>
            {gwPoints != null ? (
              <span
                className={`block text-xs font-medium ${gwLive ? 'text-live' : 'text-muted-2'}`}
              >
                {gwLive ? `${gwPoints} pts live` : `${gwPoints} pts`}
              </span>
            ) : null}
          </span>
        </Link>

        <Link
          href={`/league/${activeId}`}
          className="tile flex aspect-square flex-col justify-between p-4 active:scale-[0.98]"
        >
          <Trophy className="h-5 w-5 text-muted-2" strokeWidth={1.8} />
          <span className="min-w-0">
            <span className="block text-[0.58rem] font-medium uppercase tracking-[0.16em] text-muted-2">
              League
            </span>
            <span className="mt-1 block truncate text-base font-semibold tracking-tight">
              {active?.name}
            </span>
            <span className="block text-xs text-muted">
              {teamCount} {teamCount === 1 ? 'team' : 'teams'}
            </span>
            {myRank ? (
              <span className="block text-xs font-medium text-muted-2">
                {ordinal(myRank)} of {fieldSize}
              </span>
            ) : null}
          </span>
        </Link>

        {/* Last draft, once drafted. */}
        {active?.draftStatus === 'complete' && firstPick ? (
          <Link
            href={`/draft?league=${activeId}`}
            className="tile flex aspect-square flex-col justify-between p-4 active:scale-[0.98]"
          >
            <Swords className="h-5 w-5 text-muted-2" strokeWidth={1.8} />
            <span className="min-w-0">
              <span className="block text-[0.58rem] font-medium uppercase tracking-[0.16em] text-muted-2">
                Last Draft
              </span>
              <span className="mt-1 block truncate text-base font-semibold tracking-tight">
                {firstPick}
              </span>
              <span className="block text-xs text-muted">your first pick</span>
            </span>
          </Link>
        ) : null}

        <Link
          href="/players"
          className="tile flex aspect-square flex-col justify-between p-4 active:scale-[0.98]"
        >
          <Search className="h-5 w-5 text-muted-2" strokeWidth={1.8} />
          <span className="min-w-0">
            <span className="block text-[0.58rem] font-medium uppercase tracking-[0.16em] text-muted-2">
              Scout
            </span>
            <span className="mt-1 block truncate text-base font-semibold tracking-tight">
              Players
            </span>
            <span className="block text-xs text-muted">form and fixtures</span>
          </span>
        </Link>
      </section>

      {/* Movement recap, only when something moved. */}
      {recap ? (
        <section className="reveal card space-y-1.5 p-4 text-center" style={{ animationDelay: '190ms' }}>
          <p className="text-xs text-muted">This gameweek so far</p>
          {recap.you ? (
            <p className="flex items-center gap-2 text-sm">
              {recap.you.rankDelta > 0 ? (
                <TrendingUp className="h-4 w-4 text-accent" />
              ) : recap.you.rankDelta < 0 ? (
                <TrendingDown className="h-4 w-4 text-live" />
              ) : null}
              <span>
                You are <span className="font-bold">{ordinal(recap.you.rank)}</span>
                {recap.you.rankDelta !== 0 ? (
                  <span className={recap.you.rankDelta > 0 ? 'text-accent' : 'text-live'}>
                    {' '}
                    ({recap.you.rankDelta > 0 ? 'up' : 'down'} {Math.abs(recap.you.rankDelta)}{' '}
                    {Math.abs(recap.you.rankDelta) === 1 ? 'spot' : 'spots'})
                  </span>
                ) : null}
                {recap.you.gained !== 0 ? (
                  <span className="text-muted">
                    , {recap.you.gained > 0 ? `+${recap.you.gained}` : recap.you.gained} pts
                  </span>
                ) : null}
              </span>
            </p>
          ) : null}
          {recap.climber ? (
            <p className="text-xs text-muted">
              Biggest climber: <span className="font-bold text-accent">{recap.climber.name}</span>{' '}
              up {recap.climber.up} {recap.climber.up === 1 ? 'spot' : 'spots'}
            </p>
          ) : null}
          {recap.gainer ? (
            <p className="text-xs text-muted">
              Most points today: <span className="font-bold text-gold">{recap.gainer.name}</span> +
              {recap.gainer.pts}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

// Local alias so the wide fpl_players table reads clearly above.
import { fplPlayers as sqlFplId } from '@/lib/schema';
