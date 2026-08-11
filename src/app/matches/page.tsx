import Link from 'next/link';
import { redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fixtures, fplPlayers, gameweeks } from '@/lib/schema';
import { readSession } from '@/lib/auth';
import PullToRefresh from '@/components/PullToRefresh';
import LivePoller from '@/components/matches/LivePoller';

export const dynamic = 'force-dynamic';

// All fixtures for a gameweek with live scores. Reads Neon only; the sync
// keeps scores fresh every 2 minutes during matches and LivePoller
// re-renders the page while anything is live.
export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ gw?: string }>;
}) {
  const session = await readSession();
  if (!session) redirect('/?next=/matches');
  const { gw: gwParam } = await searchParams;

  const gws = await db.select().from(gameweeks).orderBy(asc(gameweeks.gw));
  if (!gws.length) {
    return <p className="py-10 text-center text-sm text-muted">Fixtures arrive after the first sync.</p>;
  }
  const current = gws.find((g) => g.isCurrent) ?? gws.find((g) => g.isNext) ?? gws[0];
  const requested = Number(gwParam);
  const gw = gws.find((g) => g.gw === requested) ?? current;

  const rows = await db
    .select()
    .from(fixtures)
    .where(eq(fixtures.gw, gw.gw))
    .orderBy(asc(fixtures.kickoff), asc(fixtures.fplFixtureId));

  const clubs = await db
    .selectDistinct({
      clubId: fplPlayers.clubId,
      clubName: fplPlayers.clubName,
      clubShort: fplPlayers.clubShort,
    })
    .from(fplPlayers);
  const clubById = new Map(clubs.map((c) => [c.clubId, c]));
  const anyLive = rows.some((f) => f.started && !f.finished);

  // Group fixtures by day for scannable sections.
  const byDay = new Map<string, typeof rows>();
  for (const f of rows) {
    const key = f.kickoff
      ? f.kickoff.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
      : 'Date TBC';
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(f);
  }

  return (
    <div className="reveal space-y-4 py-4 lg:mx-auto lg:max-w-2xl">
      <PullToRefresh />
      {anyLive ? <LivePoller /> : null}
      <div className="space-y-1 text-center">
        <h1 className="font-display text-4xl">Matches</h1>
        <p className="text-xs text-muted">
          {gw.name}
          {gw.finished ? ' · finished' : anyLive ? '' : ` · deadline ${gw.deadline.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`}
        </p>
      </div>

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

      {[...byDay.entries()].map(([day, dayRows]) => (
        <div key={day} className="space-y-2">
          <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
            {day}
          </p>
          <div className="card divide-y divide-[var(--line)] px-3">
            {dayRows.map((f) => {
              const home = clubById.get(f.homeClub);
              const away = clubById.get(f.awayClub);
              const live = f.started && !f.finished;
              return (
                <div key={f.fplFixtureId} className="flex min-h-13 items-center gap-2 py-2">
                  <span className="min-w-0 flex-1 truncate text-right text-sm font-bold">
                    {home?.clubName ?? `Club ${f.homeClub}`}
                  </span>
                  <span className="flex w-20 shrink-0 flex-col items-center">
                    {f.started ? (
                      <>
                        <span className="font-display text-2xl leading-none tabular-nums">
                          {f.homeScore ?? 0} - {f.awayScore ?? 0}
                        </span>
                        {live ? (
                          <span className="mt-0.5 flex items-center gap-1 rounded-full bg-live/15 px-2 py-0.5 text-[0.6rem] font-bold tracking-wider text-live">
                            <span className="live-dot h-1.5 w-1.5 rounded-full bg-live" />
                            LIVE
                          </span>
                        ) : (
                          <span className="mt-0.5 rounded-full bg-white/[0.06] px-2 py-0.5 text-[0.6rem] font-bold tracking-wider text-muted">
                            FT
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-sm font-bold tabular-nums text-muted">
                        {f.kickoff
                          ? f.kickoff.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                          : 'TBC'}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">
                    {away?.clubName ?? `Club ${f.awayClub}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No fixtures scheduled for this gameweek.</p>
      ) : null}
    </div>
  );
}
