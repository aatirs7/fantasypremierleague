import 'server-only';
import { eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { fplPlayers, gwPlayerPoints, gwScores, lineups } from './schema';
import { applyAutosubs } from './scoring-rules';

// "How many points has this player gotten ME?" Reconstructs each week's
// counting XI (stored lineup starters, with the stored autosubs applied for
// finalized weeks) and attributes every point, including the captain or
// vice doubling, to the player who earned it.

export type Contribution = {
  fplId: number;
  points: number;
  weeks: number;
};

export async function squadContributions(squadId: string): Promise<Map<number, Contribution>> {
  const lineupRows = await db.select().from(lineups).where(eq(lineups.squadId, squadId));
  if (!lineupRows.length) return new Map();
  const scoreRows = await db.select().from(gwScores).where(eq(gwScores.squadId, squadId));
  const scoreByGw = new Map(scoreRows.map((r) => [r.gw, r]));

  const gwsWithScores = lineupRows
    .map((l) => l.gw)
    .filter((gw) => scoreByGw.has(gw));
  if (!gwsWithScores.length) return new Map();

  const allIds = [...new Set(lineupRows.flatMap((l) => l.picks.map((p) => p.fplId)))];
  const statRows = await db
    .select()
    .from(gwPlayerPoints)
    .where(inArray(gwPlayerPoints.gw, gwsWithScores));
  const statByGw = new Map<number, Map<number, { minutes: number; totalPoints: number; goals: number }>>();
  for (const s of statRows) {
    if (!statByGw.has(s.gw)) statByGw.set(s.gw, new Map());
    statByGw.get(s.gw)!.set(s.fplId, { minutes: s.minutes, totalPoints: s.totalPoints, goals: s.goals });
  }
  const posRows = await db
    .select({ fplId: fplPlayers.fplId, position: fplPlayers.position })
    .from(fplPlayers)
    .where(inArray(fplPlayers.fplId, allIds));
  const posOf = new Map(posRows.map((p) => [p.fplId, p.position]));

  const out = new Map<number, Contribution>();
  const add = (fplId: number, points: number) => {
    const cur = out.get(fplId) ?? { fplId, points: 0, weeks: 0 };
    cur.points += points;
    cur.weeks += 1;
    out.set(fplId, cur);
  };

  for (const lineup of lineupRows) {
    const score = scoreByGw.get(lineup.gw);
    const statOf = statByGw.get(lineup.gw);
    if (!score || !statOf) continue;
    const stat = (id: number) => statOf.get(id) ?? { minutes: 0, totalPoints: 0, goals: 0 };

    // Final weeks count the post-autosub XI; a live week counts the named XI.
    const xi = score.final
      ? applyAutosubs(lineup.picks, statOf, posOf).finalXi
      : lineup.picks.filter((p) => p.starting).map((p) => p.fplId);
    for (const id of xi) add(id, stat(id).totalPoints);

    // Attribute the doubling to whoever actually doubled.
    const captain = lineup.picks.find((p) => p.isCaptain)?.fplId;
    const vice = lineup.picks.find((p) => p.isVice)?.fplId;
    if (score.final) {
      if (captain != null && stat(captain).minutes > 0) {
        out.get(captain) && (out.get(captain)!.points += stat(captain).totalPoints);
      } else if (vice != null && stat(vice).minutes > 0) {
        out.get(vice) && (out.get(vice)!.points += stat(vice).totalPoints);
      }
    } else if (captain != null && xi.includes(captain)) {
      out.get(captain) && (out.get(captain)!.points += stat(captain).totalPoints);
    }
  }
  return out;
}
