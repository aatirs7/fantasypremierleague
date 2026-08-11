import 'server-only';
import { and, asc, eq, gt, inArray, isNull, lte } from 'drizzle-orm';
import { db } from './db';
import { fplPlayers, gameweeks, lineups, squadPlayers, squads, type LineupPick } from './schema';
import { generateAutoLineup, type SquadPlayerInfo } from './lineup-rules';

// Lineup lifecycle:
//  - The editable GW is the earliest one whose deadline is still ahead.
//  - ensureLineup returns the stored row, else copies the previous GW's
//    lineup forward (still auto_set until touched), else auto-generates
//    from form. Deterministic and idempotent.
//  - The cron calls ensureLineupsForGw at each deadline so squads whose
//    manager never opened the app still field a valid XI.

export async function editableGw(): Promise<{ gw: number; deadline: Date } | null> {
  const [row] = await db
    .select({ gw: gameweeks.gw, deadline: gameweeks.deadline })
    .from(gameweeks)
    .where(gt(gameweeks.deadline, new Date()))
    .orderBy(asc(gameweeks.deadline))
    .limit(1);
  return row ?? null;
}

export async function squadMembers(squadId: string): Promise<SquadPlayerInfo[]> {
  const rows = await db
    .select({
      fplId: squadPlayers.fplId,
      position: fplPlayers.position,
      form: fplPlayers.form,
    })
    .from(squadPlayers)
    .innerJoin(fplPlayers, eq(fplPlayers.fplId, squadPlayers.fplId))
    .where(and(eq(squadPlayers.squadId, squadId), isNull(squadPlayers.droppedGw)));
  return rows.map((r) => ({
    fplId: r.fplId,
    position: r.position,
    form: r.form != null ? Number(r.form) : 0,
  }));
}

export async function ensureLineup(squadId: string, gw: number): Promise<LineupPick[] | null> {
  const [existing] = await db
    .select()
    .from(lineups)
    .where(and(eq(lineups.squadId, squadId), eq(lineups.gw, gw)))
    .limit(1);
  if (existing) return existing.picks;

  const members = await squadMembers(squadId);
  if (members.length !== 15) return null; // squad not drafted yet

  // Copy the most recent earlier lineup forward if the squad still matches
  // (waivers/trades can change it; then we regenerate).
  const prevRows = await db
    .select()
    .from(lineups)
    .where(and(eq(lineups.squadId, squadId), lte(lineups.gw, gw - 1)))
    .orderBy(asc(lineups.gw));
  const latestPrev = prevRows[prevRows.length - 1];

  const memberIds = new Set(members.map((m) => m.fplId));
  let picks: LineupPick[];
  if (
    latestPrev &&
    latestPrev.picks.length === 15 &&
    latestPrev.picks.every((p) => memberIds.has(p.fplId))
  ) {
    picks = latestPrev.picks;
  } else {
    picks = generateAutoLineup(members);
  }

  await db
    .insert(lineups)
    .values({ squadId, gw, picks, autoSet: true, setAt: new Date() })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(lineups)
    .where(and(eq(lineups.squadId, squadId), eq(lineups.gw, gw)))
    .limit(1);
  return row?.picks ?? picks;
}

// Cron: make sure every squad in every real league has a lineup for a GW
// whose deadline just passed. Test leagues included so their scoring works,
// they are only excluded from cross-league stats.
export async function ensureLineupsForGw(gw: number, notes: string[]): Promise<void> {
  const allSquads = await db.select({ id: squads.id }).from(squads);
  let made = 0;
  for (const s of allSquads) {
    const [existing] = await db
      .select({ squadId: lineups.squadId })
      .from(lineups)
      .where(and(eq(lineups.squadId, s.id), eq(lineups.gw, gw)))
      .limit(1);
    if (existing) continue;
    const picks = await ensureLineup(s.id, gw);
    if (picks) made++;
  }
  if (made > 0) notes.push(`lineups: generated ${made} for gw${gw}`);
}

export async function playersByIds(ids: number[]) {
  if (!ids.length) return [];
  return db
    .select({
      fplId: fplPlayers.fplId,
      photoCode: fplPlayers.photoCode,
      webName: fplPlayers.webName,
      position: fplPlayers.position,
      clubShort: fplPlayers.clubShort,
      form: fplPlayers.form,
      status: fplPlayers.status,
    })
    .from(fplPlayers)
    .where(inArray(fplPlayers.fplId, ids));
}
