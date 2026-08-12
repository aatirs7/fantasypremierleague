import Link from 'next/link';
import { redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fixtures, fplPlayers, gameweeks } from '@/lib/schema';
import { readSession } from '@/lib/auth';
import LivePoller from '@/components/matches/LivePoller';
import ClubBadge from '@/components/matches/ClubBadge';
import LocalTime from '@/components/LocalTime';
import { computePLTable } from '@/lib/pl-table';

export const dynamic = 'force-dynamic';

type Club = { clubId: number; clubCode: number | null; clubName: string; clubShort: string };
type FixtureRow = typeof fixtures.$inferSelect;

// One fixture, wc26 MatchRow style: stacked team rows with club badges,
// loser dimmed, status pill and kickoff time in the right rail.
function MatchCard({ f, clubById }: { f: FixtureRow; clubById: Map<number, Club> }) {
  const played = f.homeScore !== null && f.awayScore !== null && f.started;
  const live = f.started && !f.finished;
  const homeWin = played && (f.homeScore ?? 0) > (f.awayScore ?? 0);
  const awayWin = played && (f.awayScore ?? 0) > (f.homeScore ?? 0);

  const Side = ({ clubId, score, isWinner }: { clubId: number; score: number | null; isWinner: boolean }) => {
    const club = clubById.get(clubId);
    return (
      <div className={`flex items-center gap-2.5 ${played && !isWinner && homeWin !== awayWin ? 'opacity-55' : ''}`}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-black/20">
          <ClubBadge clubCode={club?.clubCode ?? null} name={club?.clubShort ?? '?'} size={22} />
        </span>
        <span className="flex-1 truncate text-sm font-semibold">{club?.clubName ?? `Club ${clubId}`}</span>
        {f.started ? (
          <span className={`font-display text-xl tabular-nums ${isWinner ? 'text-accent' : ''}`}>
            {score ?? 0}
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <Link href={`/matches/${f.fplFixtureId}`} className="card block p-3 active:scale-[0.99]">
      <div className="flex items-stretch gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Side clubId={f.homeClub} score={f.homeScore} isWinner={homeWin} />
          <Side clubId={f.awayClub} score={f.awayScore} isWinner={awayWin} />
        </div>
        <div className="flex w-16 shrink-0 flex-col items-end justify-center gap-1 border-l border-edge pl-2.5 text-right">
          {live ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-live/15 px-2 py-0.5 text-[0.62rem] font-bold tracking-wider text-live">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-live" />
              LIVE
            </span>
          ) : f.finished ? (
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[0.62rem] font-bold tracking-wider text-muted">
              FT
            </span>
          ) : (
            <span className="font-display text-base leading-none text-foreground">
              {f.kickoff ? <LocalTime iso={f.kickoff.toISOString()} mode="time" /> : 'TBC'}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ gw?: string; view?: string }>;
}) {
  const session = await readSession();
  if (!session) redirect('/?next=/matches');
  const { gw: gwParam, view } = await searchParams;
  const showTable = view === 'table';

  const gws = await db.select().from(gameweeks).orderBy(asc(gameweeks.gw));
  if (!gws.length) {
    return <p className="py-10 text-center text-sm text-muted">Fixtures arrive after the first sync.</p>;
  }
  const current = gws.find((g) => g.isCurrent) ?? gws.find((g) => g.isNext) ?? gws[0];
  const requested = Number(gwParam);
  const gw = gws.find((g) => g.gw === requested) ?? current;

  const clubs = await db
    .selectDistinct({
      clubId: fplPlayers.clubId,
      clubCode: fplPlayers.clubCode,
      clubName: fplPlayers.clubName,
      clubShort: fplPlayers.clubShort,
    })
    .from(fplPlayers);
  const clubById = new Map<number, Club>(clubs.map((c) => [c.clubId, c]));

  const rows = showTable
    ? []
    : await db
        .select()
        .from(fixtures)
        .where(eq(fixtures.gw, gw.gw))
        .orderBy(asc(fixtures.kickoff), asc(fixtures.fplFixtureId));

  const allFixtures = showTable ? await db.select().from(fixtures) : [];
  const plTable = showTable
    ? computePLTable(
        allFixtures,
        clubs.map((c) => c.clubId),
        (id) => clubById.get(id)?.clubName ?? String(id),
      )
    : [];

  const anyLive = showTable
    ? plTable.some((r) => r.live)
    : rows.some((f) => f.started && !f.finished);

  // Group by calendar day. The heading itself renders in the viewer's
  // timezone from the day's first kickoff.
  const byDay = new Map<string, FixtureRow[]>();
  for (const f of rows) {
    const key = f.kickoff ? f.kickoff.toISOString().slice(0, 10) : 'tbc';
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(f);
  }

  return (
    <div className="reveal space-y-4 py-4 lg:mx-auto lg:max-w-2xl">
      {anyLive ? <LivePoller /> : null}

      <header className="flex flex-col items-center gap-3 pt-2">
        <h1 className="font-display text-4xl leading-none">Matches</h1>
        <div className="flex rounded-full border border-edge bg-white/[0.03] p-1 text-xs font-bold">
          <Link
            href={`/matches?gw=${gw.gw}`}
            className={`rounded-full px-4 py-1.5 transition-colors ${!showTable ? 'bg-accent text-[var(--accent-ink)]' : 'text-muted'}`}
          >
            Fixtures
          </Link>
          <Link
            href="/matches?view=table"
            className={`rounded-full px-4 py-1.5 transition-colors ${showTable ? 'bg-accent text-[var(--accent-ink)]' : 'text-muted'}`}
          >
            PL Table
          </Link>
        </div>
      </header>

      {showTable ? (
        <div className="space-y-2">
          {anyLive ? (
            <p className="text-center text-xs text-gold">Matches are live, the table is moving.</p>
          ) : null}
          <div className="card px-3">
            <div className="flex min-h-8 items-center gap-2 py-1.5 text-[0.6rem] font-bold uppercase tracking-wider text-muted-2">
              <span className="w-7 text-center">#</span>
              <span className="flex-1">Club</span>
              <span className="w-7 text-center">P</span>
              <span className="w-9 text-center">GD</span>
              <span className="w-9 text-center">Pts</span>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {plTable.map((r, i) => {
                const rank = i + 1;
                const club = clubById.get(r.clubId);
                return (
                  <div key={r.clubId} className="flex min-h-11 items-center gap-2 py-1.5 text-sm">
                    <span
                      className={`flex h-6 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
                        rank <= 4
                          ? 'bg-accent/15 text-accent'
                          : rank >= plTable.length - 2
                            ? 'bg-live/15 text-live'
                            : 'text-muted'
                      }`}
                    >
                      {rank}
                    </span>
                    <ClubBadge clubCode={club?.clubCode ?? null} name={club?.clubShort ?? '?'} size={22} />
                    <span className="min-w-0 flex-1 truncate font-bold">
                      {club?.clubName ?? r.clubId}
                      {r.live ? (
                        <span className="live-dot ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-live" />
                      ) : null}
                    </span>
                    <span className="w-7 shrink-0 text-center tabular-nums text-muted">{r.played}</span>
                    <span className="w-9 shrink-0 text-center tabular-nums text-muted">
                      {r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}
                    </span>
                    <span className="w-9 shrink-0 text-center font-display text-lg tabular-nums">
                      {r.points}
                    </span>
                  </div>
                );
              })}
            </div>
            {plTable.every((r) => r.played === 0) ? (
              <p className="py-3 text-center text-xs text-muted">
                Everyone level on zero until the season kicks off.
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div className="-mx-4 overflow-x-auto px-4">
            <div className="flex w-max gap-1.5 pb-1">
              {gws.map((g) => (
                <Link
                  key={g.gw}
                  href={`/matches?gw=${g.gw}`}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors ${
                    g.gw === gw.gw
                      ? 'bg-accent text-[var(--accent-ink)]'
                      : g.gw === current.gw
                        ? 'border border-accent/40 bg-accent/10 text-accent'
                        : 'border border-edge bg-white/[0.02] text-muted'
                  }`}
                >
                  GW{g.gw}
                </Link>
              ))}
            </div>
          </div>
          <p className="text-center text-xs text-muted-2">
            {gw.name}
            {gw.finished ? (
              ' · finished'
            ) : (
              <>
                {' · deadline '}
                <LocalTime iso={gw.deadline.toISOString()} mode="weekday-time" />
              </>
            )}
          </p>

          {[...byDay.entries()].map(([day, dayRows]) => (
            <section key={day}>
              <h2 className="sticky top-0 z-10 mb-2 -mx-1 bg-[var(--bg)]/80 px-1 py-1 text-center font-display text-lg tracking-wide text-muted backdrop-blur lg:top-16">
                {dayRows[0]?.kickoff ? (
                  <LocalTime iso={dayRows[0].kickoff.toISOString()} mode="day" />
                ) : (
                  'Date TBC'
                )}
              </h2>
              <div className="space-y-2">
                {dayRows.map((f) => (
                  <MatchCard key={f.fplFixtureId} f={f} clubById={clubById} />
                ))}
              </div>
            </section>
          ))}
          {rows.length === 0 ? (
            <p className="card p-5 text-center text-sm text-muted">
              No fixtures scheduled for this gameweek.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
