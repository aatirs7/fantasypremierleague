import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { gameweeks, standingSnapshots, type leagues } from '@/lib/schema';
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

  return (
    <div className="space-y-2">
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Table</p>
      {anyLive ? (
        <p className="rounded-xl border border-gold/30 bg-gold/[0.08] px-3 py-2 text-xs text-gold">
          Matches are live. GW points are provisional: autosubs and final bonus land when the
          gameweek is confirmed.
        </p>
      ) : null}
      {rows.length ? (
        <LeagueTable rows={rows} />
      ) : (
        <p className="card p-4 text-sm text-muted">Scores appear once the first gameweek kicks off.</p>
      )}
    </div>
  );
}
