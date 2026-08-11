import 'server-only';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { withTransaction, type Tx } from './db';
import {
  draftPicks,
  fplPlayers,
  leagueMembers,
  leagues,
  squadPlayers,
  squads,
  users,
} from './schema';
import { MIN_MANAGERS } from './leagues';

// Snake draft engine. Every mutation runs inside one WebSocket transaction
// holding pg_advisory_xact_lock on the league, so two managers tapping the
// same player in the same second resolve to exactly one owner and one clean
// error. Timeouts are enforced lazily: any state poll or pick attempt that
// arrives after a deadline first executes the overdue auto-pick(s) inside
// the same locked transaction, then proceeds. No background worker.

export const QUOTAS: Record<string, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
export const SQUAD_SIZE = 15;
export const PICK_MS = 90_000;

export class DraftError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

// 1-based pick number -> 0-based index into draft order (snake).
export function pickerIndex(pickNumber: number, managers: number): number {
  const round = Math.ceil(pickNumber / managers);
  const within = (pickNumber - 1) % managers;
  return round % 2 === 1 ? within : managers - 1 - within;
}

export function roundOf(pickNumber: number, managers: number): number {
  return Math.ceil(pickNumber / managers);
}

async function lockLeague(tx: Tx, leagueId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${leagueId}))`);
}

type LeagueRow = typeof leagues.$inferSelect;

async function loadLeague(tx: Tx, leagueId: string): Promise<LeagueRow> {
  const [league] = await tx.select().from(leagues).where(eq(leagues.id, leagueId)).limit(1);
  if (!league) throw new DraftError('League not found', 404);
  return league;
}

type OrderedMember = { userId: string; draftOrder: number; isBot: boolean };

async function draftOrderMembers(tx: Tx, leagueId: string): Promise<OrderedMember[]> {
  const rows = await tx
    .select({
      userId: leagueMembers.userId,
      draftOrder: leagueMembers.draftOrder,
      isBot: users.isBot,
    })
    .from(leagueMembers)
    .innerJoin(users, eq(users.id, leagueMembers.userId))
    .where(eq(leagueMembers.leagueId, leagueId))
    .orderBy(asc(leagueMembers.draftOrder));
  return rows
    .filter((r): r is typeof r & { draftOrder: number } => r.draftOrder != null)
    .map((r) => ({ userId: r.userId, draftOrder: r.draftOrder, isBot: r.isBot }));
}

// Per-squad position counts for quota checks.
async function positionCounts(tx: Tx, leagueId: string, squadId: string) {
  const rows = await tx
    .select({ position: fplPlayers.position, n: sql<number>`count(*)::int` })
    .from(squadPlayers)
    .innerJoin(fplPlayers, eq(fplPlayers.fplId, squadPlayers.fplId))
    .where(
      and(
        eq(squadPlayers.leagueId, leagueId),
        eq(squadPlayers.squadId, squadId),
        isNull(squadPlayers.droppedGw),
      ),
    )
    .groupBy(fplPlayers.position);
  const counts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const r of rows) counts[r.position] = r.n;
  return counts;
}

async function squadIdFor(tx: Tx, leagueId: string, userId: string): Promise<string> {
  const [row] = await tx
    .select({ id: squads.id })
    .from(squads)
    .where(and(eq(squads.leagueId, leagueId), eq(squads.userId, userId)))
    .limit(1);
  if (!row) throw new DraftError('Squad missing for picker', 500);
  return row.id;
}

function pickDeadline(league: LeagueRow, picker: OrderedMember, from: Date): Date {
  const ms = picker.isBot && league.botSpeedMs != null ? league.botSpeedMs : PICK_MS;
  return new Date(from.getTime() + ms);
}

async function advance(
  tx: Tx,
  league: LeagueRow,
  members: OrderedMember[],
  from: Date,
): Promise<LeagueRow> {
  const totalPicks = members.length * SQUAD_SIZE;
  const nextPick = (league.currentPick ?? 0) + 1;
  if (nextPick > totalPicks) {
    const [updated] = await tx
      .update(leagues)
      .set({
        draftStatus: 'complete',
        currentPick: null,
        currentPickDeadline: null,
        stateVersion: league.stateVersion + 1,
      })
      .where(eq(leagues.id, league.id))
      .returning();
    return updated;
  }
  const nextPicker = members[pickerIndex(nextPick, members.length)];
  const [updated] = await tx
    .update(leagues)
    .set({
      currentPick: nextPick,
      currentPickDeadline: pickDeadline(league, nextPicker, from),
      stateVersion: league.stateVersion + 1,
    })
    .where(eq(leagues.id, league.id))
    .returning();
  return updated;
}

async function insertPick(
  tx: Tx,
  league: LeagueRow,
  members: OrderedMember[],
  userId: string,
  fplId: number,
  auto: boolean,
): Promise<void> {
  const squadId = await squadIdFor(tx, league.id, userId);
  await tx.insert(draftPicks).values({
    leagueId: league.id,
    round: roundOf(league.currentPick!, members.length),
    pickNumber: league.currentPick!,
    userId,
    fplId,
    autoPicked: auto,
    pickedAt: new Date(),
  });
  await tx.insert(squadPlayers).values({
    leagueId: league.id,
    squadId,
    fplId,
    acquiredVia: 'draft',
    acquiredGw: null,
  });
}

// Best available player at the picker's neediest position: lowest draft_rank
// (nulls last), tiebreak highest total points. bot_variance samples the top
// five so repeated test drafts differ.
async function chooseAutoPick(
  tx: Tx,
  league: LeagueRow,
  squadId: string,
): Promise<number> {
  const counts = await positionCounts(tx, league.id, squadId);
  let bestPositions: string[] = [];
  let bestDeficit = -1;
  for (const pos of Object.keys(QUOTAS)) {
    const deficit = QUOTAS[pos] - counts[pos];
    if (deficit > bestDeficit) {
      bestDeficit = deficit;
      bestPositions = [pos];
    } else if (deficit === bestDeficit) {
      bestPositions.push(pos);
    }
  }
  if (bestDeficit <= 0) throw new DraftError('Squad already full', 500);
  const candidates = await tx
    .select({ fplId: fplPlayers.fplId })
    .from(fplPlayers)
    .where(
      sql`${fplPlayers.position} in ${bestPositions}
        and not exists (
          select 1 from squad_players sp
          where sp.league_id = ${league.id}
            and sp.fpl_id = ${fplPlayers.fplId}
            and sp.dropped_gw is null
        )`,
    )
    .orderBy(
      sql`${fplPlayers.draftRank} asc nulls last`,
      sql`${fplPlayers.totalPoints} desc`,
    )
    .limit(5);
  if (candidates.length === 0) throw new DraftError('No available players to auto-pick', 500);
  const idx = league.botVariance ? Math.floor(Math.random() * candidates.length) : 0;
  return candidates[idx].fplId;
}

// Execute every overdue pick (auto-picks for humans who timed out, and bot
// turns whose short deadline has passed). Called from every state poll and
// at the top of every pick attempt, inside the league lock.
async function executeOverduePicks(
  tx: Tx,
  league: LeagueRow,
  members: OrderedMember[],
): Promise<LeagueRow> {
  let current = league;
  // Hard bound: never loop more than the number of remaining picks.
  const totalPicks = members.length * SQUAD_SIZE;
  let guard = totalPicks + 1;
  while (
    current.draftStatus === 'active' &&
    current.currentPick != null &&
    current.currentPickDeadline != null &&
    current.currentPickDeadline.getTime() <= Date.now() &&
    guard-- > 0
  ) {
    const picker = members[pickerIndex(current.currentPick, members.length)];
    const squadId = await squadIdFor(tx, current.id, picker.userId);
    const fplId = await chooseAutoPick(tx, current, squadId);
    await insertPick(tx, current, members, picker.userId, fplId, true);
    current = await advance(tx, current, members, new Date());
  }
  return current;
}

function shuffle<T>(items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function startDraft(leagueId: string, userId: string): Promise<void> {
  await withTransaction(async (tx) => {
    await lockLeague(tx, leagueId);
    const league = await loadLeague(tx, leagueId);
    if (league.ownerId !== userId) throw new DraftError('Only the owner can start the draft', 403);
    if (league.draftStatus !== 'pending') throw new DraftError('Draft already started');
    if (league.draftTime && league.draftTime.getTime() > Date.now()) {
      throw new DraftError('It is not draft time yet');
    }
    const memberRows = await tx
      .select({ userId: leagueMembers.userId })
      .from(leagueMembers)
      .where(eq(leagueMembers.leagueId, leagueId));
    if (memberRows.length < MIN_MANAGERS) {
      throw new DraftError(`You need at least ${MIN_MANAGERS} managers to draft`);
    }
    // Randomize the order and persist it.
    const order = shuffle(memberRows.map((m) => m.userId));
    for (let i = 0; i < order.length; i++) {
      await tx
        .update(leagueMembers)
        .set({ draftOrder: i + 1 })
        .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, order[i])));
    }
    // One squad per member, idempotent.
    for (const uid of order) {
      await tx
        .insert(squads)
        .values({ leagueId, userId: uid })
        .onConflictDoNothing();
    }
    const members = await draftOrderMembers(tx, leagueId);
    const first = members[0];
    await tx
      .update(leagues)
      .set({
        draftStatus: 'active',
        currentPick: 1,
        currentPickDeadline: pickDeadline(league, first, new Date()),
        stateVersion: league.stateVersion + 1,
      })
      .where(eq(leagues.id, leagueId));
  });
}

export async function makePick(
  leagueId: string,
  userId: string,
  fplId: number,
  expectedPickNumber: number,
): Promise<void> {
  await withTransaction(async (tx) => {
    await lockLeague(tx, leagueId);
    let league = await loadLeague(tx, leagueId);
    if (league.draftStatus !== 'active') throw new DraftError('The draft is not active');
    const members = await draftOrderMembers(tx, leagueId);
    league = await executeOverduePicks(tx, league, members);
    if (league.draftStatus !== 'active' || league.currentPick == null) {
      throw new DraftError('The draft just completed');
    }
    const picker = members[pickerIndex(league.currentPick, members.length)];
    if (picker.userId !== userId) throw new DraftError('It is not your turn');
    if (league.currentPick !== expectedPickNumber) {
      throw new DraftError('The board moved on, check the latest state');
    }
    const [player] = await tx
      .select({ fplId: fplPlayers.fplId, position: fplPlayers.position })
      .from(fplPlayers)
      .where(eq(fplPlayers.fplId, fplId))
      .limit(1);
    if (!player) throw new DraftError('Unknown player', 404);
    // Still unowned in this league? The partial unique index backstops this.
    const [owned] = await tx
      .select({ id: squadPlayers.id })
      .from(squadPlayers)
      .where(
        and(
          eq(squadPlayers.leagueId, leagueId),
          eq(squadPlayers.fplId, fplId),
          isNull(squadPlayers.droppedGw),
        ),
      )
      .limit(1);
    if (owned) throw new DraftError('That player was just taken');
    const squadId = await squadIdFor(tx, leagueId, userId);
    const counts = await positionCounts(tx, leagueId, squadId);
    if (counts[player.position] >= QUOTAS[player.position]) {
      throw new DraftError(
        `You already have ${QUOTAS[player.position]} ${player.position}s`,
      );
    }
    await insertPick(tx, league, members, userId, fplId, false);
    await advance(tx, league, members, new Date());
  });
}

// Runs overdue picks if any, used by the state poll. Cheap when nothing is
// overdue: one advisory lock + one select.
export async function enforceDeadlines(leagueId: string): Promise<void> {
  await withTransaction(async (tx) => {
    await lockLeague(tx, leagueId);
    const league = await loadLeague(tx, leagueId);
    if (league.draftStatus !== 'active') return;
    if (
      league.currentPickDeadline == null ||
      league.currentPickDeadline.getTime() > Date.now()
    ) {
      return;
    }
    const members = await draftOrderMembers(tx, leagueId);
    await executeOverduePicks(tx, league, members);
  });
}
