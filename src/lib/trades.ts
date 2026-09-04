import 'server-only';
import { and, asc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db, withTransaction, type Tx } from './db';
import {
  fplPlayers,
  gameweeks,
  leagues,
  squadPlayers,
  squads,
  trades,
} from './schema';
import { QUOTAS } from './draft';

// Trades, spec section 10. 1-for-1 up to 3-for-3; both squads must satisfy
// 2/5/5/3 AFTER the swap. 48h expiry, optional 24h owner veto window. Trades
// always take effect from the next unlocked gameweek, so accepting one mid
// gameweek never touches a lineup that is already locked in for scoring.
// Execution runs inside the league advisory lock and verifies every player
// is still where the trade expects it.

export class TradeError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

const EXPIRY_MS = 48 * 60 * 60 * 1000;
const VETO_MS = 24 * 60 * 60 * 1000;

async function squadIdOf(tx: Tx, leagueId: string, userId: string): Promise<string> {
  const [row] = await tx
    .select({ id: squads.id })
    .from(squads)
    .where(and(eq(squads.leagueId, leagueId), eq(squads.userId, userId)))
    .limit(1);
  if (!row) throw new TradeError('Squad not found', 404);
  return row.id;
}

async function activePlayers(tx: Tx, squadId: string) {
  return tx
    .select({ fplId: squadPlayers.fplId, id: squadPlayers.id })
    .from(squadPlayers)
    .where(and(eq(squadPlayers.squadId, squadId), isNull(squadPlayers.droppedGw)));
}

// Both squads must land exactly on quota after the swap.
async function validateSwap(
  tx: Tx,
  leagueId: string,
  proposerId: string,
  receiverId: string,
  offer: number[],
  request: number[],
): Promise<void> {
  const proposerSquad = await squadIdOf(tx, leagueId, proposerId);
  const receiverSquad = await squadIdOf(tx, leagueId, receiverId);
  const pPlayers = await activePlayers(tx, proposerSquad);
  const rPlayers = await activePlayers(tx, receiverSquad);
  const pIds = new Set(pPlayers.map((p) => p.fplId));
  const rIds = new Set(rPlayers.map((p) => p.fplId));
  for (const id of offer) {
    if (!pIds.has(id)) throw new TradeError('An offered player is no longer on the proposing squad');
  }
  for (const id of request) {
    if (!rIds.has(id)) throw new TradeError('A requested player is no longer on the receiving squad');
  }

  const allIds = [...pIds, ...rIds];
  const positions = await tx
    .select({ fplId: fplPlayers.fplId, position: fplPlayers.position })
    .from(fplPlayers)
    .where(inArray(fplPlayers.fplId, allIds));
  const posOf = new Map(positions.map((p) => [p.fplId, p.position]));

  const countAfter = (ids: Set<number>, out: number[], into: number[]) => {
    const counts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    const next = new Set(ids);
    for (const id of out) next.delete(id);
    for (const id of into) next.add(id);
    for (const id of next) counts[posOf.get(id) ?? 'MID']++;
    return counts;
  };
  for (const [who, counts] of [
    ['Your squad', countAfter(pIds, offer, request)],
    ['Their squad', countAfter(rIds, request, offer)],
  ] as const) {
    for (const pos of Object.keys(QUOTAS)) {
      if (counts[pos] !== QUOTAS[pos]) {
        throw new TradeError(`${who} would have ${counts[pos]} ${pos}s (needs ${QUOTAS[pos]})`);
      }
    }
  }
}

export async function proposeTrade(
  leagueId: string,
  proposerId: string,
  receiverId: string,
  offer: number[],
  request: number[],
): Promise<string> {
  if (proposerId === receiverId) throw new TradeError('You cannot trade with yourself', 400);
  if (offer.length < 1 || offer.length > 3 || request.length < 1 || request.length > 3) {
    throw new TradeError('Trades are 1-for-1 up to 3-for-3', 400);
  }
  return withTransaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${leagueId}))`);
    await validateSwap(tx, leagueId, proposerId, receiverId, offer, request);
    const [row] = await tx
      .insert(trades)
      .values({
        leagueId,
        proposerId,
        receiverId,
        offerFplIds: offer,
        requestFplIds: request,
      })
      .returning();
    return row.id;
  });
}

async function executeTradeInTx(tx: Tx, trade: typeof trades.$inferSelect): Promise<void> {
  await validateSwap(
    tx,
    trade.leagueId,
    trade.proposerId,
    trade.receiverId,
    trade.offerFplIds,
    trade.requestFplIds,
  );
  const proposerSquad = await squadIdOf(tx, trade.leagueId, trade.proposerId);
  const receiverSquad = await squadIdOf(tx, trade.leagueId, trade.receiverId);
  const [next] = await tx
    .select({ gw: gameweeks.gw })
    .from(gameweeks)
    .where(sql`${gameweeks.deadline} > now()`)
    .orderBy(asc(gameweeks.deadline))
    .limit(1);
  const gw = next?.gw ?? null;

  const move = async (fplIds: number[], fromSquad: string, toSquad: string) => {
    for (const fplId of fplIds) {
      await tx
        .update(squadPlayers)
        .set({ droppedGw: gw ?? 0 })
        .where(
          and(
            eq(squadPlayers.squadId, fromSquad),
            eq(squadPlayers.fplId, fplId),
            isNull(squadPlayers.droppedGw),
          ),
        );
      await tx.insert(squadPlayers).values({
        leagueId: trade.leagueId,
        squadId: toSquad,
        fplId,
        acquiredVia: 'trade',
        acquiredGw: gw,
      });
    }
  };
  await move(trade.offerFplIds, proposerSquad, receiverSquad);
  await move(trade.requestFplIds, receiverSquad, proposerSquad);
  await tx
    .update(trades)
    .set({ status: 'executed', resolvedAt: new Date() })
    .where(eq(trades.id, trade.id));
}

export async function respondTrade(
  tradeId: string,
  userId: string,
  accept: boolean,
): Promise<void> {
  await withTransaction(async (tx) => {
    const [trade] = await tx.select().from(trades).where(eq(trades.id, tradeId)).limit(1);
    if (!trade) throw new TradeError('Trade not found', 404);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${trade.leagueId}))`);
    if (trade.receiverId !== userId) throw new TradeError('Only the receiver can respond', 403);
    if (trade.status !== 'pending') throw new TradeError('Trade already resolved');
    if (!accept) {
      await tx
        .update(trades)
        .set({ status: 'rejected', resolvedAt: new Date() })
        .where(eq(trades.id, tradeId));
      return;
    }
    const [league] = await tx
      .select({ vetoEnabled: leagues.vetoEnabled })
      .from(leagues)
      .where(eq(leagues.id, trade.leagueId))
      .limit(1);
    if (league?.vetoEnabled) {
      await tx
        .update(trades)
        .set({ status: 'accepted', executesAt: new Date(Date.now() + VETO_MS) })
        .where(eq(trades.id, tradeId));
    } else {
      await executeTradeInTx(tx, trade);
    }
  });
}

export async function cancelTrade(tradeId: string, userId: string): Promise<void> {
  const [trade] = await db.select().from(trades).where(eq(trades.id, tradeId)).limit(1);
  if (!trade) throw new TradeError('Trade not found', 404);
  if (trade.proposerId !== userId) throw new TradeError('Only the proposer can cancel', 403);
  if (trade.status !== 'pending') throw new TradeError('Trade already resolved');
  await db
    .update(trades)
    .set({ status: 'cancelled', resolvedAt: new Date() })
    .where(eq(trades.id, tradeId));
}

export async function vetoTrade(tradeId: string, userId: string): Promise<void> {
  const [trade] = await db.select().from(trades).where(eq(trades.id, tradeId)).limit(1);
  if (!trade) throw new TradeError('Trade not found', 404);
  const [league] = await db.select().from(leagues).where(eq(leagues.id, trade.leagueId)).limit(1);
  if (!league || league.ownerId !== userId) throw new TradeError('Only the owner can veto', 403);
  if (trade.status !== 'accepted') throw new TradeError('Only accepted trades can be vetoed');
  await db
    .update(trades)
    .set({ status: 'vetoed', resolvedAt: new Date() })
    .where(eq(trades.id, tradeId));
}

// Cron: execute accepted trades whose veto window has passed; expire stale
// pending trades. Test leagues skipped.
export async function runTradeCron(notes: string[]): Promise<void> {
  const testLeagues = await db
    .select({ id: leagues.id })
    .from(leagues)
    .where(eq(leagues.isTest, true));
  const testIds = new Set(testLeagues.map((l) => l.id));

  const due = await db
    .select()
    .from(trades)
    .where(and(eq(trades.status, 'accepted'), lt(trades.executesAt, new Date())));
  for (const trade of due) {
    if (testIds.has(trade.leagueId)) continue;
    try {
      await withTransaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${trade.leagueId}))`);
        const [fresh] = await tx.select().from(trades).where(eq(trades.id, trade.id)).limit(1);
        if (fresh?.status === 'accepted') await executeTradeInTx(tx, fresh);
      });
      notes.push(`trade ${trade.id} executed`);
    } catch (e) {
      // Squads changed since acceptance: void the trade rather than force it.
      await db
        .update(trades)
        .set({ status: 'cancelled', resolvedAt: new Date() })
        .where(eq(trades.id, trade.id));
      notes.push(`trade ${trade.id} voided: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const expired = await db
    .update(trades)
    .set({ status: 'expired', resolvedAt: new Date() })
    .where(and(eq(trades.status, 'pending'), lt(trades.proposedAt, new Date(Date.now() - EXPIRY_MS))))
    .returning({ id: trades.id });
  if (expired.length) notes.push(`trades: expired ${expired.length}`);
}
