import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import {
  ArrowLeftRight,
  ArrowRight,
  ListOrdered,
  Search,
  Shirt,
  Swords,
  Timer,
} from 'lucide-react';
import { db } from '@/lib/db';
import { gameweeks, gwScores, leagues, squads, standingSnapshots, users } from '@/lib/schema';
import { inArray } from 'drizzle-orm';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { readSession } from '@/lib/auth';
import { editableGw } from '@/lib/lineup';
import { leagueTable } from '@/lib/scoring';
import { myLeagues, resolveActiveLeagueId } from '@/lib/leagues';
import LeagueActions from '@/components/leagues/LeagueActions';
import Countdown from '@/components/leagues/Countdown';
import RememberLeague from '@/components/RememberLeague';
import PullToRefresh from '@/components/PullToRefresh';

export const dynamic = 'force-dynamic';

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const session = await readSession();
  if (!session) redirect('/?next=/home');
  const { league: requested } = await searchParams;
  const mine = await myLeagues(session.userId);

  // No league yet: the dashboard IS the join/create chooser.
  if (mine.length === 0) {
    return (
      <div className="reveal mx-auto max-w-md space-y-6 py-8 text-center">
        <header className="space-y-2">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent font-display text-2xl text-[var(--accent-ink)]">
            {session.username.slice(0, 1).toUpperCase()}
          </span>
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.2em] text-muted">Welcome</p>
          <h1 className="font-display text-3xl leading-none">{session.username}</h1>
        </header>
        <p className="text-sm text-muted">
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

  const nextGw = await editableGw();
  const [currentGw] = await db
    .select({ gw: gameweeks.gw })
    .from(gameweeks)
    .where(eq(gameweeks.isCurrent, true))
    .limit(1);

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
  if (mySquad && gwPoints == null) {
    const [latest] = await db
      .select({ totalPoints: gwScores.totalPoints, final: gwScores.final })
      .from(gwScores)
      .where(eq(gwScores.squadId, mySquad.id))
      .limit(1);
    if (latest) {
      gwPoints = latest.totalPoints;
      gwLive = !latest.final;
    }
  }

  // Recap: movement since this gameweek's baseline snapshot, wc26 style.
  // Only a UNIQUE top mover gets named; ties stay quiet.
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

  const lq = `?league=${activeId}`;

  return (
    <div className="space-y-4 py-2 lg:mx-auto lg:max-w-2xl">
      <PullToRefresh />
      <RememberLeague leagueId={activeId} />

      <header className="reveal flex items-center justify-center gap-2.5 pt-1 text-center">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent font-display text-lg text-[var(--accent-ink)]">
          {session.username.slice(0, 1).toUpperCase()}
        </span>
        <h1 className="truncate font-display text-2xl leading-none">{session.username}</h1>
      </header>

      {mine.length > 1 ? (
        <div className="-mx-4 overflow-x-auto px-4">
          <div className="flex w-max justify-center gap-1.5 lg:w-full">
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

      {active?.draftStatus === 'pending' ? (
        <section className="reveal card space-y-3 p-4 text-center" style={{ animationDelay: '60ms' }}>
          <div className="inline-flex items-center justify-center gap-2 text-gold">
            <Timer className="h-4 w-4" />
            <span className="text-[0.7rem] font-bold uppercase tracking-[0.2em]">
              {active.draftTime ? 'Draft starts in' : 'Draft not scheduled yet'}
            </span>
          </div>
          {active.draftTime ? (
            <p className="font-display text-4xl">
              <Countdown toIso={active.draftTime.toISOString()} doneText="It is draft time" />
            </p>
          ) : null}
          <Link
            href={`/league/${activeId}/draft`}
            className="mx-auto flex min-h-11 max-w-xs items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-[var(--accent-ink)] active:scale-95"
          >
            <Swords className="h-4 w-4" />
            Enter the draft room
          </Link>
        </section>
      ) : active?.draftStatus === 'active' ? (
        <Link
          href={`/league/${activeId}/draft`}
          className="your-pick reveal flex min-h-14 items-center justify-center gap-2 rounded-[1.1rem] p-4 text-lg font-bold active:scale-[0.99]"
        >
          <Swords className="h-5 w-5" />
          Draft is LIVE, jump in
        </Link>
      ) : (
        <>
          {nextGw ? (
            <Link
              href="/squad"
              className="reveal card flex min-h-12 items-center justify-center gap-2 px-4 py-2.5 text-center"
              style={{ animationDelay: '60ms' }}
            >
              <Timer className="h-4 w-4 shrink-0 text-gold" />
              <span className="text-sm">
                <span className="font-bold">GW{nextGw.gw}</span>
                <span className="text-muted"> locks in </span>
                <span className="font-bold text-gold">
                  <Countdown toIso={nextGw.deadline.toISOString()} doneText="moments" />
                </span>
              </span>
            </Link>
          ) : null}

          <section className="reveal grid grid-cols-2 gap-3" style={{ animationDelay: '100ms' }}>
            <div className="card flex flex-col items-center justify-between p-3 text-center">
              <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Your rank</p>
              <p className="mt-1.5 font-display text-3xl leading-none">
                {myRank ? (
                  <>
                    {ordinal(myRank)} <span className="text-muted">of {fieldSize}</span>
                  </>
                ) : (
                  <span className="text-gold">-</span>
                )}
              </p>
              {mine.length > 1 && active ? (
                <p className="mt-1 max-w-full truncate text-xs text-muted">{active.name}</p>
              ) : null}
            </div>
            <div className="card flex flex-col items-center justify-between p-3 text-center">
              <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Points</p>
              <p className="mt-1.5 font-display text-3xl leading-none text-accent">{seasonPoints}</p>
              {gwPoints != null ? (
                <p className={`mt-1 text-[0.6rem] font-bold uppercase tracking-wider ${gwLive ? 'text-live' : 'text-muted'}`}>
                  {gwLive ? `● GW ${gwPoints} live` : `GW: ${gwPoints}`}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted">Scores once it starts</p>
              )}
            </div>
          </section>
        </>
      )}

      {recap ? (
        <section className="reveal card space-y-2 p-4 text-center" style={{ animationDelay: '120ms' }}>
          <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
            This gameweek so far
          </p>
          {recap.you ? (
            <p className="flex items-center justify-center gap-2 text-sm">
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
              Biggest climber: <span className="font-bold text-accent">{recap.climber.name}</span> up{' '}
              {recap.climber.up} {recap.climber.up === 1 ? 'spot' : 'spots'}
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

      <section className="reveal grid grid-cols-2 gap-2.5" style={{ animationDelay: '140ms' }}>
        {[
          { href: '/squad', label: 'My Squad', icon: Shirt },
          { href: `/league/${activeId}`, label: 'Table', icon: ListOrdered },
          ...(active?.draftStatus === 'complete'
            ? [
                { href: `/league/${activeId}/waivers`, label: 'Waivers', icon: Search },
                { href: `/league/${activeId}/trades`, label: 'Trades', icon: ArrowLeftRight },
              ]
            : []),
        ].map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="card flex min-h-12 items-center gap-2.5 px-3.5 active:scale-[0.98]"
          >
            <t.icon className="h-4.5 w-4.5 shrink-0 text-accent" strokeWidth={2.2} />
            <span className="flex-1 truncate text-sm font-bold">{t.label}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-2" />
          </Link>
        ))}
      </section>
    </div>
  );
}
