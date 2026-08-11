import { db } from '@/lib/db';
import { fixtures, fplPlayers } from '@/lib/schema';
import { computePLTable } from '@/lib/pl-table';
import ClubBadge from './ClubBadge';

// The real Premier League table, shared by the Matches hub and the League
// page toggle. Server component; counts live scores the moment they land.
export default async function PLStandings() {
  const clubs = await db
    .selectDistinct({
      clubId: fplPlayers.clubId,
      clubCode: fplPlayers.clubCode,
      clubName: fplPlayers.clubName,
      clubShort: fplPlayers.clubShort,
    })
    .from(fplPlayers);
  const clubById = new Map(clubs.map((c) => [c.clubId, c]));
  const allFixtures = await db.select().from(fixtures);
  const table = computePLTable(
    allFixtures,
    clubs.map((c) => c.clubId),
    (id) => clubById.get(id)?.clubName ?? String(id),
  );
  const anyLive = table.some((r) => r.live);

  return (
    <div className="space-y-2">
      {anyLive ? (
        <p className="text-center text-xs text-gold">Matches are live, the table is moving.</p>
      ) : null}
      <div className="card px-3">
        <div className="flex min-h-8 items-center gap-2 py-1.5 text-[0.6rem] font-semibold uppercase tracking-wider text-muted-2">
          <span className="w-7 text-center">#</span>
          <span className="flex-1">Club</span>
          <span className="w-7 text-center">P</span>
          <span className="w-9 text-center">GD</span>
          <span className="w-9 text-center">Pts</span>
        </div>
        <div className="divide-y divide-[var(--line)]">
          {table.map((r, i) => {
            const rank = i + 1;
            const club = clubById.get(r.clubId);
            return (
              <div key={r.clubId} className="flex min-h-11 items-center gap-2 py-1.5 text-sm">
                <span
                  className={`flex h-6 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
                    rank <= 4
                      ? 'bg-accent/15 text-accent'
                      : rank >= table.length - 2
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
                <span className="w-9 shrink-0 text-center text-base font-bold tabular-nums">
                  {r.points}
                </span>
              </div>
            );
          })}
        </div>
        {table.every((r) => r.played === 0) ? (
          <p className="py-3 text-center text-xs text-muted">
            Everyone level on zero until the season kicks off.
          </p>
        ) : null}
      </div>
    </div>
  );
}
