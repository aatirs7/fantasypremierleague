import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fixtures, fplPlayers, type FixtureStat } from '@/lib/schema';
import { readSession } from '@/lib/auth';
import ClubBadge from '@/components/matches/ClubBadge';
import BackButton from '@/components/BackButton';
import {
  CircleSlash,
  Footprints,
  Goal,
  Hand,
  Square,
  Star,
  type LucideIcon,
} from 'lucide-react';
import LivePoller from '@/components/matches/LivePoller';
import LocalTime from '@/components/LocalTime';

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

  // Every event type in one table: icon in the middle, home names left,
  // away names right. Nine separate cards each holding two words read as
  // broken rather than as a match report.
  const EVENTS: { id: string; label: string; icon: LucideIcon; suffix?: string }[] = [
    { id: 'goals_scored', label: 'Goals', icon: Goal },
    { id: 'assists', label: 'Assists', icon: Footprints },
    { id: 'own_goals', label: 'Own goals', icon: Goal },
    { id: 'penalties_saved', label: 'Pens saved', icon: Hand },
    { id: 'penalties_missed', label: 'Pens missed', icon: CircleSlash },
    { id: 'yellow_cards', label: 'Yellows', icon: Square },
    { id: 'red_cards', label: 'Reds', icon: Square },
    { id: 'saves', label: 'Saves', icon: Hand },
    { id: 'bonus', label: 'Bonus', icon: Star },
  ];

  const rows = EVENTS.map((e) => {
    const stat = byId2.get(e.id);
    if (!stat) return null;
    const h = renderSide(stat.h, e.suffix ?? '');
    const a = renderSide(stat.a, e.suffix ?? '');
    if (!h.length && !a.length) return null;
    return { ...e, h, a };
  }).filter(Boolean) as { id: string; label: string; icon: LucideIcon; h: string[]; a: string[] }[];

  const goals = byId2.get('goals_scored');
  const scorersHome = goals ? renderSide(goals.h) : [];
  const scorersAway = goals ? renderSide(goals.a) : [];

  return (
    <div className="reveal space-y-4 pb-3 pt-1 lg:mx-auto lg:max-w-2xl">
      {live ? <LivePoller /> : null}
      <BackButton
        fallback="/matches"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-edge text-muted active:scale-95"
      />

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
          {!f.started && f.kickoff ? (
            <>
              {' '}
              <LocalTime iso={f.kickoff.toISOString()} mode="date-time" />
            </>
          ) : null}
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
        rows.length ? (
          <div className="card divide-y divide-[var(--line)] px-3">
            {rows.map((r) => {
              const Icon = r.icon;
              const card = r.id === 'yellow_cards' || r.id === 'red_cards';
              return (
                <div key={r.id} className="flex items-start gap-2 py-2.5 text-xs">
                  <span className="min-w-0 flex-1 space-y-0.5 text-left">
                    {r.h.map((l) => (
                      <span key={l} className="block truncate font-semibold">
                        {l}
                      </span>
                    ))}
                  </span>
                  <span className="flex w-20 shrink-0 flex-col items-center gap-0.5 pt-0.5">
                    <Icon
                      className={`h-3.5 w-3.5 ${
                        r.id === 'red_cards'
                          ? 'text-live'
                          : r.id === 'yellow_cards'
                            ? 'text-gold'
                            : 'text-muted-2'
                      }`}
                      strokeWidth={1.8}
                      fill={card ? 'currentColor' : 'none'}
                    />
                    <span className="text-[0.55rem] font-medium uppercase tracking-wider text-muted-2">
                      {r.label}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 space-y-0.5 text-right">
                    {r.a.map((l) => (
                      <span key={l} className="block truncate font-semibold">
                        {l}
                      </span>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="card p-5 text-center text-sm text-muted">
            No events recorded yet. They land with the next sync.
          </p>
        )
      ) : (
        <p className="card p-5 text-center text-sm text-muted">
          Events appear here once the match kicks off.
        </p>
      )}
    </div>
  );
}
