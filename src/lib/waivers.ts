import 'server-only';
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { db, withTransaction, type Tx } from './db';
import { fplPlayers, gameweeks, squadPlayers, squads } from './schema';
import { QUOTAS } from './draft';

// Free agency, open to everyone, all the time.
//
// This replaced a waiver system with claims, a priority order and a nightly
// processing window. In an eight-person league among friends that machinery
// cost more than it was worth: you filed a claim, waited a day, and usually
// lost the player to whoever happened to sit above you in a table nobody
// wanted to think about. Now any unowned player can be signed the moment you
// want him, first come first served, decided by the same advisory lock that
// settles a contested draft pick.
//
// The rules that remain are the ones that keep a squad legal: one in and one
// out, and the 2/5/5/3 shape has to survive the swap.

export class WaiverError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

export type SigningWindow = {
  upcomingGw: number;
  deadline: Date;
  open: boolean;
};

// Signings apply to the next gameweek that has not locked. A pickup during a
// live gameweek is fine: it lands on the bench for the following one, and it
// cannot touch a lineup that has already been scored.
export async function signingWindow(): Promise<SigningWindow | null> {
  const [upcoming] = await db
    .select()
    .from(gameweeks)
    .where(gt(gameweeks.deadline, new Date()))
    .orderBy(asc(gameweeks.deadline))
    .limit(1);
  if (!upcoming) return null;
  return { upcomingGw: upcoming.gw, deadline: upcoming.deadline, open: true };
}

async function txPositionCounts(
  tx: Tx,
  leagueId: string,
  squadId: string,
): Promise<Record<string, number>> {
  const rows = await tx
    .select({ position: fplPlayers.position })
    .from(squadPlayers)
    .innerJoin(fplPlayers, eq(fplPlayers.fplId, squadPlayers.fplId))
    .where(
      and(
        eq(squadPlayers.leagueId, leagueId),
        eq(squadPlayers.squadId, squadId),
        isNull(squadPlayers.droppedGw),
      ),
    );
  const counts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const r of rows) counts[r.position]++;
  return counts;
}

// The add/drop itself, inside the league advisory lock so two managers going
// for the same player in the same second resolve to exactly one owner.
async function executeSwap(
  tx: Tx,
  leagueId: string,
  userId: string,
  addFplId: number,
  dropFplId: number,
  gw: number,
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
  if (addOwned) throw new WaiverError('Someone just signed him');

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
      throw new WaiverError(
        `That swap would leave you with ${counts[pos]} ${pos}s and you need ${QUOTAS[pos]}`,
      );
    }
  }

  await tx.update(squadPlayers).set({ droppedGw: gw }).where(eq(squadPlayers.id, dropRow.id));
  await tx.insert(squadPlayers).values({
    leagueId,
    squadId: squad.id,
    fplId: addFplId,
    acquiredVia: 'free_agent',
    acquiredGw: gw,
  });
  // Whoever you drop goes straight back into the pool. No lock, no waiting
  // period: if someone else wants him a second later, they can have him.
}

// Sign an unowned player, dropping one of your own to make room.
export async function signFreeAgent(
  leagueId: string,
  userId: string,
  addFplId: number,
  dropFplId: number,
): Promise<void> {
  const win = await signingWindow();
  if (!win) throw new WaiverError('The season is over');
  await withTransaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${leagueId}))`);
    await executeSwap(tx, leagueId, userId, addFplId, dropFplId, win.upcomingGw);
  });
}
