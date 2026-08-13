import Link from 'next/link';
import { db } from '@/lib/db';
import { gameweeks } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { h2hStandings, weekFixtures } from '@/lib/h2h';
import { REGULAR_SEASON_END, SEMIS_GW } from '@/lib/h2h-rules';
import Avatar from '@/components/Avatar';

const ROUND_LABEL: Record<string, string> = {
  semi: 'Semi-final',
  final: 'Final',
  third: 'Third place',
};

// Head-to-head: this week's fixtures on top, then the W-L table with a
// playoff cut line.
export default async function H2HStandings({
  leagueId,
  viewerId,
}: {
  leagueId: string;
  viewerId: string;
}) {
  const [current] = await db
    .select({ gw: gameweeks.gw })
    .from(gameweeks)
    .where(eq(gameweeks.isCurrent, true))
    .limit(1);
  const [next] = await db
    .select({ gw: gameweeks.gw })
    .from(gameweeks)
    .where(eq(gameweeks.isNext, true))
    .limit(1);
  const gw = current?.gw ?? next?.gw ?? 1;

  const [table, fixtures] = await Promise.all([
    h2hStandings(leagueId),
    weekFixtures(leagueId, gw),
  ]);
  if (!table.length) {
    return (
      <p className="card p-4 text-center text-sm text-muted">
        The schedule is drawn once your draft finishes.
      </p>
    );
  }
  const playoffSpots = table.length >= 4 ? 4 : 2;

  return (
    <div className="space-y-4">
      {fixtures.length ? (
        <section className="space-y-2">
          <p className="text-center text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
            {gw >= SEMIS_GW ? 'Playoffs' : `Gameweek ${gw}`}
          </p>
          {fixtures.map((f) => {
            const homeWin = f.settled && f.away && f.home.points > f.away.points;
            const awayWin = f.settled && f.away && f.away.points > f.home.points;
            return (
              <div key={f.slot} className="tile p-3">
                {f.round !== 'regular' ? (
                  <p className="mb-1.5 text-center text-[0.55rem] font-medium uppercase tracking-[0.18em] text-gold">
                    {ROUND_LABEL[f.round] ?? f.round}
                  </p>
                ) : null}
                {f.away ? (
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex min-w-0 flex-1 items-center gap-2 ${awayWin ? 'opacity-55' : ''}`}
                    >
                      <Avatar name={f.home.username} size={26} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {f.home.username}
                        {f.home.userId === viewerId ? (
                          <span className="ml-1 text-[0.55rem] font-bold text-accent">YOU</span>
                        ) : null}
                      </span>
                      <span className={`text-base font-bold tabular-nums ${homeWin ? 'text-accent' : ''}`}>
                        {f.home.points}
                      </span>
                    </span>
                    <span className="shrink-0 text-[0.6rem] text-muted-2">v</span>
                    <span
                      className={`flex min-w-0 flex-1 items-center gap-2 ${homeWin ? 'opacity-55' : ''}`}
                    >
                      <span className={`text-base font-bold tabular-nums ${awayWin ? 'text-accent' : ''}`}>
                        {f.away.points}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-right text-sm font-semibold">
                        {f.away.username}
                        {f.away.userId === viewerId ? (
                          <span className="ml-1 text-[0.55rem] font-bold text-accent">YOU</span>
                        ) : null}
                      </span>
                      <Avatar name={f.away.username} size={26} />
                    </span>
                  </div>
                ) : (
                  <p className="text-center text-sm text-muted">
                    <span className="font-semibold text-foreground">{f.home.username}</span> has a bye
                    this week
                  </p>
                )}
              </div>
            );
          })}
        </section>
      ) : null}

      <section className="space-y-2">
        <p className="text-center text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
          Standings
        </p>
        <div className="card px-3">
          <div className="flex min-h-8 items-center gap-2 py-2 text-[0.55rem] font-medium uppercase tracking-wider text-muted-2">
            <span className="w-5 text-center">#</span>
            <span className="flex-1 pl-9">Manager</span>
            <span className="w-14 text-center">W-L-D</span>
            <span className="w-12 text-right">Pts for</span>
          </div>
          <div className="divide-y divide-[var(--line)] pb-1">
            {table.map((r) => (
              <div key={r.userId} className="relative">
                <Link
                  href={`/league/${leagueId}/squad/${r.userId}`}
                  className={`flex min-h-12 items-center gap-2 rounded-lg px-1 py-1.5 ${
                    r.userId === viewerId ? 'bg-accent/[0.07]' : ''
                  }`}
                >
                  <span
                    className={`w-5 shrink-0 text-center text-sm font-bold tabular-nums ${
                      r.rank <= playoffSpots ? 'text-accent' : 'text-muted-2'
                    }`}
                  >
                    {r.rank}
                  </span>
                  <Avatar name={r.username} size={30} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {r.username}
                    {r.userId === viewerId ? (
                      <span className="ml-1.5 text-[0.55rem] font-bold text-accent">YOU</span>
                    ) : null}
                  </span>
                  <span className="w-14 shrink-0 text-center text-sm font-semibold tabular-nums">
                    {r.wins}-{r.losses}
                    {r.draws ? `-${r.draws}` : ''}
                  </span>
                  <span className="w-12 shrink-0 text-right text-sm tabular-nums text-muted">
                    {r.pointsFor}
                  </span>
                </Link>
                {r.rank === playoffSpots && table.length > playoffSpots ? (
                  <div className="pointer-events-none absolute inset-x-1 -bottom-px h-px bg-accent/50" />
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <p className="text-center text-[0.6rem] text-muted-2">
          Top {playoffSpots} make the playoffs. Semi-finals GW{SEMIS_GW}, final GW{SEMIS_GW + 1}.
          Regular season ends GW{REGULAR_SEASON_END}.
        </p>
      </section>
    </div>
  );
}
