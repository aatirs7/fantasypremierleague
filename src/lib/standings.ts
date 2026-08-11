import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { leagues, standingSnapshots } from './schema';
import { leagueTable } from './scoring';

// Movement baseline, wc26 discipline: one snapshot row per (league, user),
// re-baselined when a new GW's deadline passes (its capturedKey). Between
// baselines the arrows measure "since this gameweek started". The snapshot
// sort IS leagueTable's sort; if they ever diverge the arrows lie.

export async function snapshotStandingsForGw(gw: number, notes: string[]): Promise<void> {
  const leagueRows = await db
    .select({ id: leagues.id })
    .from(leagues)
    .where(eq(leagues.draftStatus, 'complete'));
  const key = `gw:${gw}`;
  let snapped = 0;
  for (const l of leagueRows) {
    const existing = await db
      .select({ capturedKey: standingSnapshots.capturedKey })
      .from(standingSnapshots)
      .where(eq(standingSnapshots.leagueId, l.id))
      .limit(1);
    if (existing[0]?.capturedKey === key) continue; // already baselined for this GW
    const table = await leagueTable(l.id, null);
    await db.delete(standingSnapshots).where(eq(standingSnapshots.leagueId, l.id));
    if (table.length) {
      await db.insert(standingSnapshots).values(
        table.map((r) => ({
          leagueId: l.id,
          userId: r.userId,
          points: r.seasonTotal,
          rank: r.rank,
          capturedKey: key,
        })),
      );
    }
    snapped++;
  }
  if (snapped > 0) notes.push(`standings: baselined ${snapped} leagues for gw${gw}`);
}
