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
import { gameweeks, gwScores, leagues, squads } from '@/lib/schema';
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

  const lq = `?league=${activeId}`;

  return (
    <div className="space-y-6 py-4 lg:mx-auto lg:max-w-2xl">
      <PullToRefresh />
      <RememberLeague leagueId={activeId} />

      <header className="reveal flex flex-col items-center gap-2 pt-2 text-center">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent font-display text-2xl text-[var(--accent-ink)]">
          {session.username.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.2em] text-muted">Welcome back</p>
          <h1 className="truncate font-display text-3xl leading-none">{session.username}</h1>
        </div>
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
            <section className="reveal card space-y-1 p-4 text-center" style={{ animationDelay: '60ms' }}>
              <div className="inline-flex items-center justify-center gap-2 text-gold">
                <Timer className="h-4 w-4" />
                <span className="text-[0.7rem] font-bold uppercase tracking-[0.2em]">
                  Gameweek {nextGw.gw} locks in
                </span>
              </div>
              <p className="font-display text-4xl">
                <Countdown toIso={nextGw.deadline.toISOString()} doneText="Locked" />
              </p>
              <p className="text-xs text-muted">Set your lineup before the deadline</p>
            </section>
          ) : null}

          <section className="reveal grid grid-cols-2 gap-3" style={{ animationDelay: '100ms' }}>
            <div className="card flex flex-col items-center justify-between p-4 text-center">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Your rank</p>
              <p className="mt-2 font-display text-4xl leading-none">
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
            <div className="card flex flex-col items-center justify-between p-4 text-center">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Points</p>
              <p className="mt-2 font-display text-4xl leading-none text-accent">{seasonPoints}</p>
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

      <section className="reveal grid grid-cols-2 gap-3" style={{ animationDelay: '140ms' }}>
        <Link
          href="/squad"
          className="shine-sweep relative flex flex-col items-center gap-3 rounded-[1.1rem] border border-accent/30 bg-accent/10 p-4 text-center active:scale-[0.98]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 ring-1 ring-accent/40">
            <Shirt className="h-5 w-5 text-accent" strokeWidth={2.2} />
          </span>
          <span>
            <span className="block font-display text-xl leading-none text-accent">My Squad</span>
            <span className="mt-0.5 block text-xs text-muted">Set your lineup</span>
          </span>
        </Link>
        <Link
          href={`/league/${activeId}`}
          className="shine-sweep-2 relative flex flex-col items-center gap-3 rounded-[1.1rem] border border-gold/30 bg-gold/10 p-4 text-center active:scale-[0.98]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 ring-1 ring-gold/40">
            <ListOrdered className="h-5 w-5 text-gold" strokeWidth={2.2} />
          </span>
          <span>
            <span className="block font-display text-xl leading-none text-gold">Table</span>
            <span className="mt-0.5 block text-xs text-muted">The standings</span>
          </span>
        </Link>
      </section>

      <section className="reveal space-y-3" style={{ animationDelay: '180ms' }}>
        {active?.draftStatus === 'complete' ? (
          <>
            <Link
              href={`/league/${activeId}/waivers`}
              className="card flex items-center gap-3 p-4 active:scale-[0.99]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 ring-1 ring-accent/30">
                <Search className="h-5 w-5 text-accent" />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block font-display text-xl leading-none">Waivers</span>
                <span className="mt-0.5 block text-xs text-muted">Claim free agents, work the wire</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
            </Link>
            <Link
              href={`/league/${activeId}/trades`}
              className="card flex items-center gap-3 p-4 active:scale-[0.99]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 ring-1 ring-accent/30">
                <ArrowLeftRight className="h-5 w-5 text-accent" />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block font-display text-xl leading-none">Trades</span>
                <span className="mt-0.5 block text-xs text-muted">Strike a deal with a rival</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
            </Link>
          </>
        ) : null}
        <Link href="/players" className="card flex items-center gap-3 p-4 active:scale-[0.99]">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 ring-1 ring-accent/30">
            <Search className="h-5 w-5 text-accent" />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block font-display text-xl leading-none">Scout players</span>
            <span className="mt-0.5 block text-xs text-muted">Form, fixtures, and stats for all 577</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
        </Link>
      </section>

      <p className="reveal text-center text-xs text-muted-2" style={{ animationDelay: '220ms' }}>
        Want to start or join another league? Head to{' '}
        <Link href="/me" className="font-bold text-accent">
          Me
        </Link>
        .
      </p>
    </div>
  );
}
