import Link from 'next/link';
import { redirect } from 'next/navigation';
import { asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fixtures, fplPlayers, gameweeks } from '@/lib/schema';
import { readSession } from '@/lib/auth';
import LivePoller from '@/components/matches/LivePoller';
import TodayMarker from '@/components/matches/TodayMarker';
import ScrollToNext from '@/components/matches/ScrollToNext';
import ClubBadge from '@/components/matches/ClubBadge';
import LocalTime from '@/components/LocalTime';
import { computePLTable } from '@/lib/pl-table';

export const dynamic = 'force-dynamic';

type Club = { clubId: number; clubCode: number | null; clubName: string; clubShort: string };
type FixtureRow = typeof fixtures.$inferSelect;

// One fixture, wc26 MatchRow style: stacked team rows with club badges,
// loser dimmed, status pill and kickoff time in the right rail.
function Side({
  clubId,
  score,
  isWinner,
  clubById,
  started,
  dim,
}: {
  clubId: number;
  score: number | null;
  isWinner: boolean;
  clubById: Map<number, Club>;
  started: boolean;
  dim: boolean;
}) {
  const club = clubById.get(clubId);
  return (
    <div className={`flex items-center gap-2.5 ${dim ? 'opacity-55' : ''}`}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-black/20">
        <ClubBadge clubCode={club?.clubCode ?? null} name={club?.clubShort ?? '?'} size={22} />
      </span>
      <span className="flex-1 truncate text-sm font-semibold">
        {club?.clubName ?? `Club ${clubId}`}
      </span>
      {started ? (
        <span className={`font-display text-xl tabular-nums ${isWinner ? 'text-accent' : ''}`}>
          {score ?? 0}
        </span>
      ) : null}
    </div>
  );
}

// One fixture: stacked team rows with club badges, loser dimmed, status and
// kickoff time in the right rail.
function MatchCard({ f, clubById }: { f: FixtureRow; clubById: Map<number, Club> }) {
  const played = f.homeScore !== null && f.awayScore !== null && f.started;
  const live = f.started && !f.finished;
  const homeWin = played && (f.homeScore ?? 0) > (f.awayScore ?? 0);
  const awayWin = played && (f.awayScore ?? 0) > (f.homeScore ?? 0);
  const decided = played && homeWin !== awayWin;

  return (
    <Link
      href={`/matches/${f.fplFixtureId}`}
      data-kickoff={f.kickoff?.toISOString()}
      className="card block p-3 active:scale-[0.99]"
    >
      <div className="flex items-stretch gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Side
            clubId={f.homeClub}
            score={f.homeScore}
            isWinner={homeWin}
            clubById={clubById}
            started={f.started}
            dim={decided && !homeWin}
          />
          <Side
            clubId={f.awayClub}
            score={f.awayScore}
            isWinner={awayWin}
            clubById={clubById}
            started={f.started}
            dim={decided && !awayWin}
          />
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
  const { view } = await searchParams;
  const showTable = view === 'table';

  const gws = await db.select().from(gameweeks).orderBy(asc(gameweeks.gw));
  if (!gws.length) {
    return <p className="py-10 text-center text-sm text-muted">Fixtures arrive after the first sync.</p>;
  }
  const current = gws.find((g) => g.isCurrent) ?? gws.find((g) => g.isNext) ?? gws[0];

  const clubs = await db
    .selectDistinct({
      clubId: fplPlayers.clubId,
      clubCode: fplPlayers.clubCode,
      clubName: fplPlayers.clubName,
      clubShort: fplPlayers.clubShort,
    })
    .from(fplPlayers);
  const clubById = new Map<number, Club>(clubs.map((c) => [c.clubId, c]));

  // Every fixture in the season, in kickoff order. The list opens on the
  // next one to be played and you scroll up for what has already happened,
  // which is how anyone actually reads a fixture list.
  const rows = showTable
    ? []
    : await db
        .select()
        .from(fixtures)
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
  const days = [...byDay.entries()];

  // The first day that has not finished. That is where the page opens, and
  // where each gameweek pill lands.
  const nextDayKey =
    days.find(([, dayRows]) => dayRows.some((f) => !f.finished))?.[0] ?? days[days.length - 1]?.[0];
  const firstDayOfGw = new Map<number, string>();
  for (const [key, dayRows] of days) {
    const g = dayRows[0]?.gw;
    if (g != null && !firstDayOfGw.has(g)) firstDayOfGw.set(g, key);
  }

  return (
    <div className="reveal space-y-4 pb-4 pt-1 lg:mx-auto lg:max-w-2xl">
      {anyLive ? <LivePoller /> : null}

      <header className="flex flex-col items-center gap-3">
        <h1 className="font-display text-4xl leading-none">Matches</h1>
        <div className="flex rounded-full border border-edge bg-white/[0.03] p-1 text-xs font-bold">
          <Link
            href="/matches"
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
                <a
                  key={g.gw}
                  href={`#day-${firstDayOfGw.get(g.gw) ?? ''}`}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors ${
                    g.gw === current.gw
                      ? 'bg-accent text-[var(--accent-ink)]'
                      : 'border border-edge text-muted'
                  }`}
                >
                  GW{g.gw}
                </a>
              ))}
            </div>
          </div>
          <p className="text-center text-xs text-muted-2">
            {current.name} deadline{' '}
            <LocalTime iso={current.deadline.toISOString()} mode="weekday-time" />
          </p>

          {nextDayKey ? <ScrollToNext anchorId={`day-${nextDayKey}`} /> : null}
          <TodayMarker />

          {days.map(([day, dayRows]) => (
            <section key={day} id={`day-${day}`} className="scroll-mt-24">
              <h2
                data-day-kickoff={dayRows[0]?.kickoff?.toISOString()}
                className="mb-2 flex items-center gap-2 px-1 text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted-2"
              >
                <span className="shrink-0">
                  {dayRows[0]?.kickoff ? (
                    <LocalTime iso={dayRows[0].kickoff.toISOString()} mode="day" />
                  ) : (
                    'Date TBC'
                  )}
                </span>
                <span className="h-px flex-1 bg-[var(--line)]" />
                <span className="shrink-0">GW{dayRows[0]?.gw}</span>
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
              No fixtures yet. They arrive with the next sync.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
