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

// Head to head. Your own fixture is the page: it is the only result you can
// do anything about. Everyone else's sits underneath as one compact list.
export default async function H2HStandings({
  leagueId,
  viewerId,
  show = 'both',
}: {
  leagueId: string;
  viewerId: string;
  show?: 'both' | 'fixtures' | 'table';
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
      <p className="tile p-5 text-center text-sm text-muted">
        The schedule is drawn once your draft finishes.
      </p>
    );
  }
  const playoffSpots = table.length >= 4 ? 4 : 2;
  const mine = fixtures.find((f) => f.home.userId === viewerId || f.away?.userId === viewerId);
  const others = fixtures.filter((f) => f !== mine);
  const roundLabel = gw >= SEMIS_GW ? 'Playoffs' : `Gameweek ${gw}`;

  return (
    <div className="space-y-5">
      {show !== 'table' && mine ? (
        <Link
          href={`/league/${leagueId}/h2h/${gw}/${mine.slot}`}
          className="tile tile-team block px-4 py-5 active:scale-[0.99]"
        >
          <p className="text-center text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
            {mine.round !== 'regular' ? (ROUND_LABEL[mine.round] ?? mine.round) : roundLabel}
          </p>

          {mine.away ? (
            <>
              <div className="mt-4 flex items-start justify-center gap-3">
                {[mine.home, mine.away].map((side, i) => {
                  const other = i === 0 ? mine.away! : mine.home;
                  const winning = side.points > other.points;
                  return (
                    <div
                      key={side.userId}
                      className="flex min-w-0 flex-1 flex-col items-center gap-2"
                    >
                      <Avatar name={side.username} size={52} ring={side.userId === viewerId} />
                      <span className="w-full truncate text-center text-xs font-semibold">
                        {side.username}
                      </span>
                      <span
                        className={`font-display text-4xl leading-none tabular-nums ${
                          winning ? 'text-accent' : 'text-foreground'
                        }`}
                      >
                        {side.points}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-center text-[0.65rem] text-muted">
                {mine.settled ? 'Final result' : 'Updates live through the gameweek'} · tap for the
                full breakdown
              </p>
            </>
          ) : (
            <p className="mt-3 text-center text-sm text-muted">
              You have a bye this week. Your points still count towards the tiebreak.
            </p>
          )}
        </Link>
      ) : null}

      {show !== 'table' && others.length ? (
        <section className="space-y-2">
          <p className="text-center text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
            Elsewhere this week
          </p>
          <div className="card divide-y divide-[var(--line)] px-3">
            {others.map((f) => (
              <Link
                key={f.slot}
                href={`/league/${leagueId}/h2h/${gw}/${f.slot}`}
                className="flex min-h-12 items-center gap-2 py-2 text-xs"
              >
                <span className="min-w-0 flex-1 truncate text-right font-semibold">
                  {f.home.username}
                </span>
                <span className="w-6 shrink-0 text-right font-semibold tabular-nums">
                  {f.home.points}
                </span>
                <span className="shrink-0 text-[0.6rem] text-muted-2">v</span>
                <span className="w-6 shrink-0 font-semibold tabular-nums">
                  {f.away ? f.away.points : '-'}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {f.away ? f.away.username : 'Bye'}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {show === 'fixtures' ? null : (
        <section className="space-y-2">
          <p className="text-center text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
            Standings
          </p>
          <div className="card px-3">
            <div className="flex min-h-8 items-center gap-3 py-2 text-[0.55rem] font-medium uppercase tracking-wider text-muted-2">
              <span className="w-4" />
              <span className="flex-1">Team</span>
              <span className="w-8 text-center">W</span>
              <span className="w-8 text-center">L</span>
              <span className="w-12 text-right">For</span>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {table.map((r) => {
                const isMe = r.userId === viewerId;
                const inPlayoffs = r.rank <= playoffSpots;
                return (
                  <Link
                    key={r.userId}
                    href={`/league/${leagueId}/squad/${r.userId}`}
                    className="flex min-h-12 items-center gap-3 py-2"
                  >
                    <span
                      className={`w-4 shrink-0 text-center text-xs tabular-nums ${
                        inPlayoffs ? 'font-semibold text-accent' : 'text-muted-2'
                      }`}
                    >
                      {r.rank}
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                        isMe ? 'text-accent' : ''
                      }`}
                    >
                      {r.username}
                    </span>
                    <span className="w-8 shrink-0 text-center text-sm font-semibold tabular-nums">
                      {r.wins}
                    </span>
                    <span className="w-8 shrink-0 text-center text-sm tabular-nums text-muted">
                      {r.losses}
                    </span>
                    <span className="w-12 shrink-0 text-right text-sm tabular-nums text-muted">
                      {r.pointsFor}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
          <p className="text-center text-[0.6rem] text-muted-2">
            Top {playoffSpots} make the playoffs. Regular season ends GW{REGULAR_SEASON_END}, semis
            GW{SEMIS_GW}, final GW{SEMIS_GW + 1}.
          </p>
        </section>
      )}
    </div>
  );
}
