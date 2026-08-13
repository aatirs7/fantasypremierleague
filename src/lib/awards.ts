import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { gwAwards, gwPlayerPoints, gwScores, lineups, squads, users, fplPlayers } from './schema';

// Weekly awards, computed once a gameweek is final. Deliberately includes the
// unflattering ones: the bench disaster and the captain curse are the whole
// point of a league feed.

export type AwardKind =
  | 'manager_of_week'
  | 'bench_disaster'
  | 'captain_curse'
  | 'wooden_spoon';

export const AWARD_LABELS: Record<AwardKind, string> = {
  manager_of_week: 'Manager of the Week',
  bench_disaster: 'Bench Disaster',
  captain_curse: 'Captain Curse',
  wooden_spoon: 'Wooden Spoon',
};

export async function computeAwards(leagueId: string, gw: number, notes: string[]): Promise<void> {
  const squadRows = await db
    .select({ squadId: squads.id, userId: squads.userId })
    .from(squads)
    .where(eq(squads.leagueId, leagueId));
  if (squadRows.length < 2) return;
  const squadIds = squadRows.map((s) => s.squadId);
  const ownerOf = new Map(squadRows.map((s) => [s.squadId, s.userId]));

  const scores = await db
    .select()
    .from(gwScores)
    .where(and(inArray(gwScores.squadId, squadIds), eq(gwScores.gw, gw)));
  if (!scores.length) return;

  const stats = await db.select().from(gwPlayerPoints).where(eq(gwPlayerPoints.gw, gw));
  const statOf = new Map(stats.map((s) => [s.fplId, s]));
  const lineupRows = await db
    .select()
    .from(lineups)
    .where(and(inArray(lineups.squadId, squadIds), eq(lineups.gw, gw)));
  const lineupOf = new Map(lineupRows.map((l) => [l.squadId, l.picks]));

  const rows: {
    kind: AwardKind;
    userId: string;
    value: number;
    detail: string | null;
  }[] = [];

  // Highest and lowest scores of the week.
  const ranked = scores.slice().sort((a, b) => b.totalPoints - a.totalPoints);
  const top = ranked[0];
  const bottom = ranked[ranked.length - 1];
  if (top && ownerOf.has(top.squadId)) {
    rows.push({
      kind: 'manager_of_week',
      userId: ownerOf.get(top.squadId)!,
      value: top.totalPoints,
      detail: `${top.totalPoints} points`,
    });
  }
  if (bottom && bottom.squadId !== top?.squadId && ownerOf.has(bottom.squadId)) {
    rows.push({
      kind: 'wooden_spoon',
      userId: ownerOf.get(bottom.squadId)!,
      value: bottom.totalPoints,
      detail: `${bottom.totalPoints} points, last this week`,
    });
  }

  // Most points left on the bench, and the worst captain call.
  let worstBench: { userId: string; points: number } | null = null;
  let worstCaptain: { userId: string; points: number; name: string } | null = null;
  const captainIds: number[] = [];
  for (const l of lineupRows) {
    const cap = l.picks.find((p) => p.isCaptain);
    if (cap) captainIds.push(cap.fplId);
  }
  const capNames = captainIds.length
    ? await db
        .select({ fplId: fplPlayers.fplId, webName: fplPlayers.webName })
        .from(fplPlayers)
        .where(inArray(fplPlayers.fplId, captainIds))
    : [];
  const nameOfPlayer = new Map(capNames.map((c) => [c.fplId, c.webName]));

  for (const s of squadRows) {
    const picks = lineupOf.get(s.squadId);
    if (!picks) continue;
    const benchPoints = picks
      .filter((p) => !p.starting)
      .reduce((sum, p) => sum + (statOf.get(p.fplId)?.totalPoints ?? 0), 0);
    if (!worstBench || benchPoints > worstBench.points) {
      worstBench = { userId: s.userId, points: benchPoints };
    }
    const cap = picks.find((p) => p.isCaptain);
    if (cap) {
      const capPoints = statOf.get(cap.fplId)?.totalPoints ?? 0;
      if (!worstCaptain || capPoints < worstCaptain.points) {
        worstCaptain = {
          userId: s.userId,
          points: capPoints,
          name: nameOfPlayer.get(cap.fplId) ?? 'their captain',
        };
      }
    }
  }
  if (worstBench && worstBench.points >= 15) {
    rows.push({
      kind: 'bench_disaster',
      userId: worstBench.userId,
      value: worstBench.points,
      detail: `${worstBench.points} points left on the bench`,
    });
  }
  if (worstCaptain && worstCaptain.points <= 2) {
    rows.push({
      kind: 'captain_curse',
      userId: worstCaptain.userId,
      value: worstCaptain.points,
      detail: `captained ${worstCaptain.name} for ${worstCaptain.points}`,
    });
  }

  for (const r of rows) {
    await db
      .insert(gwAwards)
      .values({ leagueId, gw, kind: r.kind, userId: r.userId, value: r.value, detail: r.detail })
      .onConflictDoUpdate({
        target: [gwAwards.leagueId, gwAwards.gw, gwAwards.kind],
        set: { userId: r.userId, value: r.value, detail: r.detail },
      });
  }
  if (rows.length) notes.push(`awards: ${rows.length} for gw${gw}`);
}

export type AwardRow = {
  gw: number;
  kind: AwardKind;
  username: string;
  detail: string | null;
};

export async function recentAwards(leagueId: string, limit = 12): Promise<AwardRow[]> {
  const rows = await db
    .select()
    .from(gwAwards)
    .where(eq(gwAwards.leagueId, leagueId))
    .orderBy(desc(gwAwards.gw))
    .limit(limit);
  if (!rows.length) return [];
  const names = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.id, rows.map((r) => r.userId)));
  const nameOf = new Map(names.map((n) => [n.id, n.username]));
  return rows.map((r) => ({
    gw: r.gw,
    kind: r.kind as AwardKind,
    username: nameOf.get(r.userId) ?? 'Unknown',
    detail: r.detail,
  }));
}
