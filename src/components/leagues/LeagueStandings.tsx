import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { gameweeks, gwScores, squads, standingSnapshots, type leagues } from '@/lib/schema';
import { leagueTable } from '@/lib/scoring';
import type { LeagueMemberInfo } from '@/lib/leagues';
import LeagueTable from './LeagueTable';

// Server component: composes the table rows with snapshot movement and the
// current GW column for a drafted league.
export default async function LeagueStandings({
  league,
  viewerId,
  members,
}: {
  league: typeof leagues.$inferSelect;
  viewerId: string;
  members: LeagueMemberInfo[];
}) {
  const [current] = await db
    .select({ gw: gameweeks.gw })
    .from(gameweeks)
    .where(eq(gameweeks.isCurrent, true))
    .limit(1);
  const table = await leagueTable(league.id, current?.gw ?? null);
  const snaps = await db
    .select()
    .from(standingSnapshots)
    .where(eq(standingSnapshots.leagueId, league.id));
  const snapByUser = new Map(snaps.map((s) => [s.userId, s]));
  const nameById = new Map(members.map((m) => [m.userId, m.username]));

  const anyLive = table.some((r) => r.currentGwLive);
  const rows = table.map((r) => {
    const snap = snapByUser.get(r.userId);
    const combined = r.seasonTotal + (r.currentGwLive ? (r.currentGwPoints ?? 0) : 0);
    return {
      rank: r.rank,
      userId: r.userId,
      username: nameById.get(r.userId) ?? 'Unknown',
      isYou: r.userId === viewerId,
      seasonTotal: r.seasonTotal,
      currentGwPoints: r.currentGwPoints,
      currentGwLive: r.currentGwLive,
      rankDelta: snap?.rank != null ? snap.rank - r.rank : 0,
      gained: snap ? combined - snap.points : 0,
      leagueId: league.id,
    };
  });

  // Season stats: leaders once at least one GW has final scores.
  const played = table.some((r) => r.seasonTotal > 0 || r.gwWins > 0);
  let bestGw: { username: string; gw: number; points: number } | null = null;
  if (played) {
    const squadRows = await db
      .select({ id: squads.id, userId: squads.userId })
      .from(squads)
      .where(eq(squads.leagueId, league.id));
    const ownerBySquad = new Map(squadRows.map((s) => [s.id, s.userId]));
    const [top] = await db
      .select({ squadId: gwScores.squadId, gw: gwScores.gw, totalPoints: gwScores.totalPoints })
      .from(gwScores)
      .where(
        squadRows.length
          ? inArray(gwScores.squadId, squadRows.map((s) => s.id))
          : eq(gwScores.squadId, '00000000-0000-0000-0000-000000000000'),
      )
      .orderBy(desc(gwScores.totalPoints))
      .limit(1);
    if (top) {
      bestGw = {
        username: nameById.get(ownerBySquad.get(top.squadId) ?? '') ?? '?',
        gw: top.gw,
        points: top.totalPoints,
      };
    }
  }
  const winsLeader = played
    ? table.slice().sort((a, b) => b.gwWins - a.gwWins)[0]
    : null;
  const goalsLeader = played
    ? table.slice().sort((a, b) => b.squadGoals - a.squadGoals)[0]
    : null;

  return (
    <div className="space-y-2">
      {anyLive ? (
        <p className="rounded-xl border border-gold/30 bg-gold/[0.08] px-3 py-2 text-xs text-gold">
          Matches are live. GW points are provisional: autosubs and final bonus land when the
          gameweek is confirmed.
        </p>
      ) : null}
      {rows.length ? (
        <LeagueTable rows={rows} />
      ) : (
        <p className="card p-4 text-center text-sm text-muted">
          Scores appear once the first gameweek kicks off.
        </p>
      )}

      {played && (bestGw || winsLeader || goalsLeader) ? (
        <div className="space-y-2 pt-2">
          <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
            Season stats
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="card p-3">
              <p className="text-[0.6rem] font-bold uppercase tracking-wider text-muted-2">Best GW</p>
              {bestGw ? (
                <>
                  <p className="mt-1 font-display text-2xl text-gold">{bestGw.points}</p>
                  <p className="truncate text-[0.65rem] text-muted">
                    {bestGw.username} · GW{bestGw.gw}
                  </p>
                </>
              ) : (
                <p className="mt-1 font-display text-2xl text-muted">-</p>
              )}
            </div>
            <div className="card p-3">
              <p className="text-[0.6rem] font-bold uppercase tracking-wider text-muted-2">GW wins</p>
              <p className="mt-1 font-display text-2xl text-accent">{winsLeader?.gwWins ?? 0}</p>
              <p className="truncate text-[0.65rem] text-muted">
                {winsLeader ? (nameById.get(winsLeader.userId) ?? '?') : '-'}
              </p>
            </div>
            <div className="card p-3">
              <p className="text-[0.6rem] font-bold uppercase tracking-wider text-muted-2">Goals</p>
              <p className="mt-1 font-display text-2xl">{goalsLeader?.squadGoals ?? 0}</p>
              <p className="truncate text-[0.65rem] text-muted">
                {goalsLeader ? (nameById.get(goalsLeader.userId) ?? '?') : '-'}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
