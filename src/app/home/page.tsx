import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, desc as sqlDesc, desc, eq, inArray, sql as sqlRaw } from 'drizzle-orm';
import {
  BookOpen,
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
import LeagueSwitcher from '@/components/leagues/LeagueSwitcher';
import Countdown, { CountdownBlocks } from '@/components/leagues/Countdown';
import RememberLeague from '@/components/RememberLeague';
import NoScroll from '@/components/NoScroll';
import PlayerPhoto from '@/components/players/PlayerPhoto';

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
      <div className="reveal mx-auto max-w-md space-y-5 pb-6 pt-2">
        <header className="text-center">
          <p className="text-sm text-muted">{greeting()}</p>
          <h1 className="text-2xl font-bold tracking-tight">{session.username}</h1>
        </header>
        <p className="px-1 text-center text-sm text-muted">
          Join a friend&apos;s league with their code, or start your own and share it.
        </p>
        <LeagueActions />
        <Link
          href="/how-it-works"
          className="btn-outline mx-auto w-full max-w-xs"
        >
          How it works
        </Link>
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

  // A strip of names for the bottom of the dashboard: before the draft it is
  // the top of the board, once the season is running it is who is in form.
  const seasonRunning = (currentGw?.gw ?? 0) > 0 && active?.draftStatus === 'complete';
  const boardPlayers = await db
    .select({
      fplId: sqlFplId.fplId,
      photoCode: sqlFplId.photoCode,
      webName: sqlFplId.webName,
      clubShort: sqlFplId.clubShort,
      position: sqlFplId.position,
      draftRank: sqlFplId.draftRank,
      form: sqlFplId.form,
      totalPoints: sqlFplId.totalPoints,
    })
    .from(sqlFplId)
    .orderBy(
      seasonRunning
        ? sqlDesc(sqlFplId.totalPoints)
        : sqlRaw`${sqlFplId.draftRank} asc nulls last`,
    )
    .limit(8);

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
    <div className="space-y-3 pb-2 lg:mx-auto lg:max-w-2xl">
      <NoScroll />
      <RememberLeague leagueId={activeId} />

      <header className="reveal text-center">
        <p className="text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
          {greeting().replace(',', '')}
        </p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{session.username}</h1>
      </header>

      {mine.length > 1 ? (
        <LeagueSwitcher leagues={mine.map((l) => ({ id: l.id, name: l.name }))} activeId={activeId} />
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
        <section className="hero-gw reveal px-5 pb-3 pt-4 text-center" style={{ animationDelay: '40ms' }}>
          <p className="text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
            {active?.draftStatus === 'complete' ? 'Next deadline' : 'Season opener'}
          </p>
          <p className="mt-0.5 text-lg font-semibold tracking-tight">Gameweek {nextGw.gw}</p>
          <div className="mb-3 mt-3">
            <CountdownBlocks toIso={nextGw.deadline.toISOString()} doneText="Underway" />
          </div>
          <Link
            href="/matches"
            className="flex items-center justify-center gap-1 border-t border-edge pt-2.5 text-sm font-medium text-muted"
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
        <section className="tile reveal space-y-2.5 p-3.5 text-center" style={{ animationDelay: '70ms' }}>
          <p className="text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
            Draft night
          </p>
          <p className="text-base font-semibold tracking-tight">
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
          className="tile flex aspect-square max-h-[10.5rem] flex-col items-center justify-center gap-2 p-3 text-center active:scale-[0.98]"
        >
          <Shirt className="h-8 w-8 text-muted" strokeWidth={1.4} />
          <span className="min-w-0 w-full">
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
          className="tile flex aspect-square max-h-[10.5rem] flex-col items-center justify-center gap-2 p-3 text-center active:scale-[0.98]"
        >
          <Trophy className="h-8 w-8 text-muted" strokeWidth={1.4} />
          <span className="min-w-0 w-full">
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

      </section>

      {/* The rules, one obvious tap away. */}
      <Link
        href="/how-it-works"
        className="tile reveal flex items-center gap-3 px-4 py-3 active:scale-[0.99]"
        style={{ animationDelay: '140ms' }}
      >
        <BookOpen className="h-5 w-5 shrink-0 text-accent" strokeWidth={1.8} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold tracking-tight">How it works</span>
          <span className="block text-xs text-muted">
            Draft, scoring, playoffs, chips and waivers explained
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-2" />
      </Link>

      {/* Board strip: fills the last of the screen with real faces. */}
      <section className="reveal" style={{ animationDelay: '150ms' }}>
        <p className="mb-1.5 text-center text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
          {seasonRunning ? 'Leading scorers' : 'Top of the board'}
        </p>
        <div className="-mx-4 overflow-x-auto px-4">
          <div className="flex w-max gap-2.5">
            {boardPlayers.map((p, i) => (
              <Link
                key={p.fplId}
                href={`/players/${p.fplId}`}
                className="tile flex w-[4.6rem] flex-col items-center gap-0.5 px-2 pb-1.5 pt-1.5 text-center active:scale-[0.98]"
              >
                <span className="text-[0.55rem] font-medium tabular-nums text-muted-2">
                  {seasonRunning ? `${p.totalPoints} pts` : `#${p.draftRank ?? i + 1}`}
                </span>
                <PlayerPhoto photoCode={p.photoCode} name={p.webName} size={28} />
                <span className="w-full truncate text-[0.62rem] font-semibold leading-tight">
                  {p.webName}
                </span>
                <span className="text-[0.55rem] text-muted-2">
                  {p.clubShort} · {p.position}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

// Local alias so the wide fpl_players table reads clearly above.
import { fplPlayers as sqlFplId } from '@/lib/schema';
