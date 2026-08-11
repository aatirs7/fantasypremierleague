import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { eq, inArray } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/lib/db';
import { fixtures, fplPlayers, type FixtureStat } from '@/lib/schema';
import { readSession } from '@/lib/auth';
import ClubBadge from '@/components/matches/ClubBadge';
import LivePoller from '@/components/matches/LivePoller';

export const dynamic = 'force-dynamic';

// Match detail: score header plus sectioned events from FPL's fixture
// stats. The FPL API carries no event minutes, so this reads as a summary
// (scorers, assists, cards, bonus) rather than a minute timeline.
export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ fixtureId: string }>;
}) {
  const session = await readSession();
  const { fixtureId } = await params;
  if (!session) redirect(`/?next=/matches/${fixtureId}`);
  const id = Number(fixtureId);
  if (!Number.isInteger(id)) notFound();

  const [f] = await db.select().from(fixtures).where(eq(fixtures.fplFixtureId, id)).limit(1);
  if (!f) notFound();

  const clubs = await db
    .selectDistinct({
      clubId: fplPlayers.clubId,
      clubCode: fplPlayers.clubCode,
      clubName: fplPlayers.clubName,
      clubShort: fplPlayers.clubShort,
    })
    .from(fplPlayers)
    .where(inArray(fplPlayers.clubId, [f.homeClub, f.awayClub]));
  const clubById = new Map(clubs.map((c) => [c.clubId, c]));
  const home = clubById.get(f.homeClub);
  const away = clubById.get(f.awayClub);

  const stats = (f.stats ?? []) as FixtureStat[];
  const byId2 = new Map<string, FixtureStat>(stats.map((s) => [s.identifier, s]));

  const playerIds = [
    ...new Set(stats.flatMap((s) => [...s.a, ...s.h].map((e) => e.element))),
  ];
  const playerRows = playerIds.length
    ? await db
        .select({ fplId: fplPlayers.fplId, webName: fplPlayers.webName })
        .from(fplPlayers)
        .where(inArray(fplPlayers.fplId, playerIds))
    : [];
  const nameOf = new Map(playerRows.map((p) => [p.fplId, p.webName]));

  const live = f.started && !f.finished;
  const status = live ? 'LIVE' : f.finished ? 'Full Time' : 'Kickoff';

  const renderSide = (entries: { value: number; element: number }[], suffix = '') =>
    entries
      .filter((e) => e.value > 0)
      .map((e) => `${nameOf.get(e.element) ?? `#${e.element}`}${e.value > 1 ? ` x${e.value}` : ''}${suffix}`);

  const Section = ({
    title,
    identifier,
    suffix = '',
  }: {
    title: string;
    identifier: string;
    suffix?: string;
  }) => {
    const s = byId2.get(identifier);
    if (!s) return null;
    const homeLines = renderSide(s.h, suffix);
    const awayLines = renderSide(s.a, suffix);
    if (!homeLines.length && !awayLines.length) return null;
    return (
      <div className="card p-4">
        <p className="mb-2 text-center text-sm font-bold">{title}</p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-1 text-left">
            {homeLines.map((l) => (
              <p key={l} className="font-semibold">{l}</p>
            ))}
          </div>
          <div className="space-y-1 text-right">
            {awayLines.map((l) => (
              <p key={l} className="font-semibold">{l}</p>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const goals = byId2.get('goals_scored');
  const scorersHome = goals ? renderSide(goals.h) : [];
  const scorersAway = goals ? renderSide(goals.a) : [];

  return (
    <div className="reveal space-y-4 py-2 lg:mx-auto lg:max-w-2xl">
      {live ? <LivePoller /> : null}
      <Link
        href="/matches"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05]"
        aria-label="back"
      >
        <ArrowLeft className="h-5 w-5 text-muted" />
      </Link>

      {/* Score header */}
      <div className="space-y-2 text-center">
        <div className="flex items-center justify-center gap-4">
          <div className="flex w-24 flex-col items-center gap-1.5">
            <ClubBadge clubCode={home?.clubCode ?? null} name={home?.clubShort ?? '?'} size={44} />
            <p className="text-lg font-bold">{home?.clubShort ?? '?'}</p>
          </div>
          <p className="text-4xl font-bold tabular-nums tracking-tight">
            {f.started ? `${f.homeScore ?? 0} - ${f.awayScore ?? 0}` : 'vs'}
          </p>
          <div className="flex w-24 flex-col items-center gap-1.5">
            <ClubBadge clubCode={away?.clubCode ?? null} name={away?.clubShort ?? '?'} size={44} />
            <p className="text-lg font-bold">{away?.clubShort ?? '?'}</p>
          </div>
        </div>
        <p
          className={`text-xs font-bold uppercase tracking-wider ${
            live ? 'text-live' : 'text-muted'
          }`}
        >
          {status}
          {!f.started && f.kickoff
            ? ` ${f.kickoff.toLocaleString('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}`
            : ''}
        </p>
        {scorersHome.length || scorersAway.length ? (
          <div className="mx-auto grid max-w-sm grid-cols-2 gap-3 text-[0.7rem] text-muted">
            <div className="text-left">
              {scorersHome.map((s) => (
                <p key={s}>{s}</p>
              ))}
            </div>
            <div className="text-right">
              {scorersAway.map((s) => (
                <p key={s}>{s}</p>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {f.started ? (
        <div className="space-y-3">
          <Section title="Goals" identifier="goals_scored" />
          <Section title="Assists" identifier="assists" />
          <Section title="Own Goals" identifier="own_goals" />
          <Section title="Penalties Saved" identifier="penalties_saved" />
          <Section title="Penalties Missed" identifier="penalties_missed" />
          <Section title="Yellow Cards" identifier="yellow_cards" />
          <Section title="Red Cards" identifier="red_cards" />
          <Section title="Saves" identifier="saves" />
          <Section title="Bonus Points" identifier="bonus" suffix=" bonus" />
          {stats.length === 0 ? (
            <p className="card p-5 text-center text-sm text-muted">
              Event details land with the next sync.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="card p-5 text-center text-sm text-muted">
          Events appear here once the match kicks off.
        </p>
      )}
    </div>
  );
}
