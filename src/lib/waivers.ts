import 'server-only';
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { db, withTransaction, type Tx } from './db';
import {
  fplPlayers,
  gameweeks,
  leagueMembers,
  leagues,
  squadPlayers,
  squads,
  waiverClaims,
  waiverLocks,
  waiverPriority,
} from './schema';
import { QUOTAS } from './draft';
import { leagueTable } from './scoring';

// Waivers, spec section 9.
// Window for upcoming GW N is always open: claims close 24 hours before
// GW N's deadline and process in priority order, one approval per manager
// per window. Dropped players are locked until the next window. After
// processing and until the deadline, unclaimed players are instant free
// agents.

export type WaiverWindow = {
  upcomingGw: number;
  deadline: Date;
  closesAt: Date;
  opensNow: boolean; // claims accepted right now
  freeAgencyNow: boolean; // instant pickups right now
  processed: boolean;
};

export class WaiverError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

export async function waiverWindow(): Promise<WaiverWindow | null> {
  const now = new Date();
  const [upcoming] = await db
    .select()
    .from(gameweeks)
    .where(gt(gameweeks.deadline, now))
    .orderBy(asc(gameweeks.deadline))
    .limit(1);
  if (!upcoming) return null;

  const closesAt = new Date(upcoming.deadline.getTime() - 24 * 60 * 60 * 1000);
  const processed = (await getProcessedFlag(upcoming.gw)) || false;
  return {
    upcomingGw: upcoming.gw,
    deadline: upcoming.deadline,
    closesAt,
    opensNow: now < closesAt && !processed,
    freeAgencyNow: processed && now < upcoming.deadline,
    processed,
  };
}

async function getProcessedFlag(gw: number): Promise<boolean> {
  const { getMetaMs } = await import('./sync');
  return (await getMetaMs(`waiversProcessed:${gw}`)) > 0;
}

// Reverse draft order until standings exist; recomputed to reverse
// standings after every finalized GW.
export async function ensurePriority(leagueId: string): Promise<void> {
  const [existing] = await db
    .select({ userId: waiverPriority.userId })
    .from(waiverPriority)
    .where(eq(waiverPriority.leagueId, leagueId))
    .limit(1);
  if (existing) return;
  const members = await db
    .select({ userId: leagueMembers.userId, draftOrder: leagueMembers.draftOrder })
    .from(leagueMembers)
    .where(eq(leagueMembers.leagueId, leagueId));
  const ordered = members
    .filter((m) => m.draftOrder != null)
    .sort((a, b) => b.draftOrder! - a.draftOrder!);
  if (!ordered.length) return;
  await db.insert(waiverPriority).values(
    ordered.map((m, i) => ({ leagueId, userId: m.userId, priority: i + 1 })),
  );
}

export async function recomputePriorityFromStandings(leagueId: string): Promise<void> {
  const table = await leagueTable(leagueId, null);
  if (!table.length) return;
  const reversed = table.slice().sort((a, b) => b.rank - a.rank);
  await db.delete(waiverPriority).where(eq(waiverPriority.leagueId, leagueId));
  await db.insert(waiverPriority).values(
    reversed.map((r, i) => ({ leagueId, userId: r.userId, priority: i + 1 })),
  );
}

async function txPositionCounts(tx: Tx, leagueId: string, squadId: string) {
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

// Shared add/drop executor used by approved claims and free agency. Runs
// inside the league advisory lock. Throws WaiverError with the reason.
async function executeSwap(
  tx: Tx,
  leagueId: string,
  userId: string,
  addFplId: number,
  dropFplId: number,
  gw: number,
  via: 'waiver' | 'free_agent',
  respectLocks: boolean,
): Promise<void> {
  const [squad] = await tx
    .select({ id: squads.id })
    .from(squads)
    .where(and(eq(squads.leagueId, leagueId), eq(squads.userId, userId)))
    .limit(1);
  if (!squad) throw new WaiverError('No squad in this league', 404);

  const [addOwned] = await tx
    .select({ id: squadPlayers.id })
    .from(squadPlayers)
    .where(
      and(
        eq(squadPlayers.leagueId, leagueId),
        eq(squadPlayers.fplId, addFplId),
        isNull(squadPlayers.droppedGw),
      ),
    )
    .limit(1);
  if (addOwned) throw new WaiverError('Player is already owned');

  if (respectLocks) {
    const [locked] = await tx
      .select({ fplId: waiverLocks.fplId })
      .from(waiverLocks)
      .where(and(eq(waiverLocks.leagueId, leagueId), eq(waiverLocks.fplId, addFplId)))
      .limit(1);
    if (locked) throw new WaiverError('Player was just dropped and is locked until the next window');
  }

  const [dropRow] = await tx
    .select({ id: squadPlayers.id })
    .from(squadPlayers)
    .where(
      and(
        eq(squadPlayers.squadId, squad.id),
        eq(squadPlayers.fplId, dropFplId),
        isNull(squadPlayers.droppedGw),
      ),
    )
    .limit(1);
  if (!dropRow) throw new WaiverError('You no longer own the player you are dropping');

  const players = await tx
    .select({ fplId: fplPlayers.fplId, position: fplPlayers.position })
    .from(fplPlayers)
    .where(inArray(fplPlayers.fplId, [addFplId, dropFplId]));
  const posOf = new Map(players.map((p) => [p.fplId, p.position]));
  const addPos = posOf.get(addFplId);
  const dropPos = posOf.get(dropFplId);
  if (!addPos || !dropPos) throw new WaiverError('Unknown player', 404);

  const counts = await txPositionCounts(tx, leagueId, squad.id);
  counts[dropPos]--;
  counts[addPos]++;
  for (const pos of Object.keys(QUOTAS)) {
    if (counts[pos] !== QUOTAS[pos]) {
      throw new WaiverError(`Swap would leave you with ${counts[pos]} ${pos}s (need ${QUOTAS[pos]})`);
    }
  }

  await tx
    .update(squadPlayers)
    .set({ droppedGw: gw })
    .where(eq(squadPlayers.id, dropRow.id));
  await tx.insert(squadPlayers).values({
    leagueId,
    squadId: squad.id,
    fplId: addFplId,
    acquiredVia: via,
    acquiredGw: gw,
  });
  // The dropped player enters the pool but stays locked until next window.
  await tx
    .insert(waiverLocks)
    .values({ leagueId, fplId: dropFplId, untilGw: gw + 1 })
    .onConflictDoUpdate({
      target: [waiverLocks.leagueId, waiverLocks.fplId],
      set: { untilGw: gw + 1 },
    });
}

// Process one league's claims at window close, inside the advisory lock:
// iterate priority order; per manager take their claims by user_rank and
// approve the first valid one; reject the rest with reasons. An approved
// manager drops to the bottom of priority immediately.
export async function processLeagueClaims(leagueId: string, gw: number): Promise<void> {
  await ensurePriority(leagueId);
  await withTransaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${leagueId}))`);

    const priorities = await tx
      .select()
      .from(waiverPriority)
      .where(eq(waiverPriority.leagueId, leagueId))
      .orderBy(asc(waiverPriority.priority));
    const claims = await tx
      .select()
      .from(waiverClaims)
      .where(
        and(
          eq(waiverClaims.leagueId, leagueId),
          eq(waiverClaims.gw, gw),
          eq(waiverClaims.status, 'pending'),
        ),
      )
      .orderBy(asc(waiverClaims.userRank));
    if (!claims.length) return;

    const approvedUsers: string[] = [];
    for (const pri of priorities) {
      const mine = claims.filter((c) => c.userId === pri.userId);
      let approved = false;
      for (const claim of mine) {
        if (approved) {
          await tx
            .update(waiverClaims)
            .set({
              status: 'rejected',
              rejectReason: 'A higher claim of yours was already approved this window',
              processedAt: new Date(),
            })
            .where(eq(waiverClaims.id, claim.id));
          continue;
        }
        try {
          // Locks do not apply to claim processing itself: locks exist to
          // stop instant free-agent grabs of just-dropped players. Players
          // dropped DURING this processing run are claimable next window.
          await executeSwap(tx, leagueId, claim.userId, claim.addFplId, claim.dropFplId, gw, 'waiver', true);
          await tx
            .update(waiverClaims)
            .set({ status: 'approved', processedAt: new Date() })
            .where(eq(waiverClaims.id, claim.id));
          approved = true;
          approvedUsers.push(claim.userId);
        } catch (e) {
          await tx
            .update(waiverClaims)
            .set({
              status: 'rejected',
              rejectReason: e instanceof WaiverError ? e.message : 'Could not process',
              processedAt: new Date(),
            })
            .where(eq(waiverClaims.id, claim.id));
        }
      }
    }

    // Rolling priority: approved managers drop to the bottom in approval
    // order; everyone else keeps relative order.
    if (approvedUsers.length) {
      const remaining = priorities
        .filter((p) => !approvedUsers.includes(p.userId))
        .map((p) => p.userId);
      const newOrder = [...remaining, ...approvedUsers];
      for (let i = 0; i < newOrder.length; i++) {
        await tx
          .update(waiverPriority)
          .set({ priority: i + 1 })
          .where(and(eq(waiverPriority.leagueId, leagueId), eq(waiverPriority.userId, newOrder[i])));
      }
    }
  });
}

// Cron: process every real league's claims when a window close passes.
export async function processDueWaivers(notes: string[]): Promise<void> {
  const win = await waiverWindow();
  if (!win) return;
  const { getMetaMs, setMeta } = await import('./sync');
  const key = `waiversProcessed:${win.upcomingGw}`;
  if ((await getMetaMs(key)) > 0) return;
  if (Date.now() < win.closesAt.getTime()) return;
  // Window must have actually existed (prior GW finished) to process.
  const leagueRows = await db
    .select({ id: leagues.id })
    .from(leagues)
    .where(and(eq(leagues.draftStatus, 'complete'), eq(leagues.isTest, false)));
  let processed = 0;
  for (const l of leagueRows) {
    try {
      await processLeagueClaims(l.id, win.upcomingGw);
      processed++;
    } catch (e) {
      notes.push(`waivers league ${l.id} FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await setMeta(key, String(Date.now()));
  notes.push(`waivers: processed ${processed} leagues for gw${win.upcomingGw}`);
}

// Instant free-agent pickup between processing and the deadline.
export async function freeAgentMove(
  leagueId: string,
  userId: string,
  addFplId: number,
  dropFplId: number,
): Promise<void> {
  const win = await waiverWindow();
  if (!win || !win.freeAgencyNow) {
    throw new WaiverError('Free agency is not open right now');
  }
  await withTransaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${leagueId}))`);
    await executeSwap(tx, leagueId, userId, addFplId, dropFplId, win.upcomingGw, 'free_agent', true);
  });
}

// Expire locks once their window has passed.
export async function cleanWaiverLocks(currentUpcomingGw: number): Promise<void> {
  await db.delete(waiverLocks).where(sql`${waiverLocks.untilGw} < ${currentUpcomingGw}`);
}
