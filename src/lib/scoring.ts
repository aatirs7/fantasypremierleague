import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import {
  fplPlayers,
  gwPlayerPoints,
  gwScores,
  leagues,
  lineups,
  seasonScores,
  squads,
} from './schema';
import {
  computeFinalScore,
  computeProvisionalScore,
  type PlayerGwStat,
} from './scoring-rules';
import { ensureLineup } from './lineup';

// The impure writer over the pure rules in scoring-rules.ts. Discipline
// carried from wc26: recompute from scratch, write with upserts keyed on
// (squad_id, gw), roll season totals up from stored rows. Any re-run
// converges to identical state.

async function statMaps(gw: number): Promise<{
  statOf: Map<number, PlayerGwStat>;
  posOf: Map<number, string>;
}> {
  const stats = await db.select().from(gwPlayerPoints).where(eq(gwPlayerPoints.gw, gw));
  const statOf = new Map<number, PlayerGwStat>(
    stats.map((s) => [s.fplId, { minutes: s.minutes, totalPoints: s.totalPoints, goals: s.goals }]),
  );
  const positions = await db
    .select({ fplId: fplPlayers.fplId, position: fplPlayers.position })
    .from(fplPlayers);
  return { statOf, posOf: new Map(positions.map((p) => [p.fplId, p.position])) };
}

async function allSquadsWithLineups(gw: number) {
  const squadRows = await db
    .select({ squadId: squads.id, leagueId: squads.leagueId, userId: squads.userId })
    .from(squads);
  const lineupRows = await db.select().from(lineups).where(eq(lineups.gw, gw));
  const lineupBySquad = new Map(lineupRows.map((l) => [l.squadId, l.picks]));
  return { squadRows, lineupBySquad };
}

export async function rescoreGwProvisional(gw: number, notes: string[]): Promise<void> {
  const { statOf, posOf } = await statMaps(gw);
  void posOf;
  const { squadRows, lineupBySquad } = await allSquadsWithLineups(gw);
  let scored = 0;
  for (const s of squadRows) {
    const picks = lineupBySquad.get(s.squadId);
    if (!picks) continue;
    const r = computeProvisionalScore(picks, statOf);
    await db
      .insert(gwScores)
      .values({
        squadId: s.squadId,
        gw,
        rawPoints: r.rawPoints,
        captainBonus: r.captainBonus,
        totalPoints: r.totalPoints,
        autosubs: r.autosubs,
        goals: r.goals,
        final: false,
      })
      .onConflictDoUpdate({
        target: [gwScores.squadId, gwScores.gw],
        set: {
          rawPoints: r.rawPoints,
          captainBonus: r.captainBonus,
          totalPoints: r.totalPoints,
          autosubs: r.autosubs,
          goals: r.goals,
          final: false,
        },
      });
    scored++;
  }
  notes.push(`provisional gw${gw}: ${scored} squads scored`);
}

export async function finalizeGw(gw: number, notes: string[]): Promise<void> {
  const { statOf, posOf } = await statMaps(gw);
  const { squadRows, lineupBySquad } = await allSquadsWithLineups(gw);
  let scored = 0;
  for (const s of squadRows) {
    // A squad with no lineup for this GW (drafted mid-season, or the
    // ensure step raced) gets one now so it is never silently zeroed.
    const picks = lineupBySquad.get(s.squadId) ?? (await ensureLineup(s.squadId, gw));
    if (!picks) continue;
    const r = computeFinalScore(picks, statOf, posOf);
    await db
      .insert(gwScores)
      .values({
        squadId: s.squadId,
        gw,
        rawPoints: r.rawPoints,
        captainBonus: r.captainBonus,
        totalPoints: r.totalPoints,
        autosubs: r.autosubs,
        goals: r.goals,
        final: true,
      })
      .onConflictDoUpdate({
        target: [gwScores.squadId, gwScores.gw],
        set: {
          rawPoints: r.rawPoints,
          captainBonus: r.captainBonus,
          totalPoints: r.totalPoints,
          autosubs: r.autosubs,
          goals: r.goals,
          final: true,
        },
      });
    scored++;
  }
  notes.push(`final gw${gw}: ${scored} squads scored`);
  await rollupSeasonScores();

  // Waiver priority follows the fresh standings (reverse order) for every
  // real league.
  const leagueRows = await db
    .select({ id: leagues.id })
    .from(leagues)
    .where(and(eq(leagues.draftStatus, 'complete'), eq(leagues.isTest, false)));
  const { recomputePriorityFromStandings } = await import('./waivers');
  for (const l of leagueRows) {
    try {
      await recomputePriorityFromStandings(l.id);
    } catch (e) {
      notes.push(`waiver priority league ${l.id} FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

// Season totals from final gw_scores only. GW wins are counted per league:
// every squad sharing the league's top score that week gets a win.
export async function rollupSeasonScores(): Promise<void> {
  const squadRows = await db
    .select({ squadId: squads.id, leagueId: squads.leagueId })
    .from(squads);
  const leagueOf = new Map(squadRows.map((s) => [s.squadId, s.leagueId]));
  const finals = await db.select().from(gwScores).where(eq(gwScores.final, true));

  type Totals = { total: number; played: number; wins: number; goals: number };
  const totals = new Map<string, Totals>();
  for (const s of squadRows) totals.set(s.squadId, { total: 0, played: 0, wins: 0, goals: 0 });

  // Top score per (league, gw).
  const top = new Map<string, number>();
  for (const row of finals) {
    const leagueId = leagueOf.get(row.squadId);
    if (!leagueId) continue;
    const key = `${leagueId}:${row.gw}`;
    top.set(key, Math.max(top.get(key) ?? -Infinity, row.totalPoints));
  }
  for (const row of finals) {
    const t = totals.get(row.squadId);
    const leagueId = leagueOf.get(row.squadId);
    if (!t || !leagueId) continue;
    t.total += row.totalPoints;
    t.played++;
    t.goals += row.goals;
    if (row.totalPoints === top.get(`${leagueId}:${row.gw}`)) t.wins++;
  }

  for (const [squadId, t] of totals) {
    await db
      .insert(seasonScores)
      .values({
        squadId,
        totalPoints: t.total,
        gwsPlayed: t.played,
        gwWins: t.wins,
        squadGoals: t.goals,
      })
      .onConflictDoUpdate({
        target: seasonScores.squadId,
        set: { totalPoints: t.total, gwsPlayed: t.played, gwWins: t.wins, squadGoals: t.goals },
      });
  }
}

// League table for one league: sorted rows with tiebreaks, plus the current
// (possibly provisional) GW score. Sort: season total desc, GW wins desc,
// squad goals desc, then username for stability.
export type TableRow = {
  squadId: string;
  userId: string;
  rank: number;
  seasonTotal: number;
  gwWins: number;
  squadGoals: number;
  currentGwPoints: number | null;
  currentGwLive: boolean;
};

export async function leagueTable(leagueId: string, currentGw: number | null): Promise<TableRow[]> {
  const squadRows = await db
    .select({ squadId: squads.id, userId: squads.userId })
    .from(squads)
    .where(eq(squads.leagueId, leagueId));
  if (!squadRows.length) return [];
  const ids = squadRows.map((s) => s.squadId);
  const season = await db.select().from(seasonScores).where(inArray(seasonScores.squadId, ids));
  const seasonBySquad = new Map(season.map((s) => [s.squadId, s]));
  const gwRows = currentGw
    ? await db
        .select()
        .from(gwScores)
        .where(and(inArray(gwScores.squadId, ids), eq(gwScores.gw, currentGw)))
    : [];
  const gwBySquad = new Map(gwRows.map((g) => [g.squadId, g]));

  const rows = squadRows
    .map((s) => {
      const se = seasonBySquad.get(s.squadId);
      const g = gwBySquad.get(s.squadId);
      return {
        squadId: s.squadId,
        userId: s.userId,
        rank: 0,
        seasonTotal: se?.totalPoints ?? 0,
        gwWins: se?.gwWins ?? 0,
        squadGoals: se?.squadGoals ?? 0,
        currentGwPoints: g?.totalPoints ?? null,
        currentGwLive: g ? !g.final : false,
      };
    })
    .sort(
      (a, b) =>
        b.seasonTotal - a.seasonTotal ||
        b.gwWins - a.gwWins ||
        b.squadGoals - a.squadGoals ||
        a.userId.localeCompare(b.userId),
    );
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

export async function isLeagueTest(leagueId: string): Promise<boolean> {
  const [row] = await db
    .select({ isTest: leagues.isTest })
    .from(leagues)
    .where(eq(leagues.id, leagueId))
    .limit(1);
  return row?.isTest ?? false;
}
