import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fplPlayers, leagues, squadPlayers, squads, trades, users } from '@/lib/schema';
import { currentUserId } from '@/lib/auth';
import { isLeagueMember } from '@/lib/leagues';
import { TradeError, cancelTrade, proposeTrade, respondTrade, vetoTrade } from '@/lib/trades';

// GET: everything the trade hub needs: every squad's players, trade lists,
// veto rights.
export async function GET(_req: Request, ctx: { params: Promise<{ leagueId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  const { leagueId } = await ctx.params;
  if (!(await isLeagueMember(userId, leagueId))) {
    return NextResponse.json({ error: 'not a member' }, { status: 403 });
  }

  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId)).limit(1);
  if (!league) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const squadRows = await db
    .select({ squadId: squads.id, userId: squads.userId, username: users.username, isBot: users.isBot })
    .from(squads)
    .innerJoin(users, eq(users.id, squads.userId))
    .where(eq(squads.leagueId, leagueId));
  const owned = await db
    .select({ fplId: squadPlayers.fplId, squadId: squadPlayers.squadId })
    .from(squadPlayers)
    .where(and(eq(squadPlayers.leagueId, leagueId), isNull(squadPlayers.droppedGw)));
  const ids = [...new Set(owned.map((o) => o.fplId))];
  const players = ids.length
    ? await db
        .select({
          fplId: fplPlayers.fplId,
          webName: fplPlayers.webName,
          position: fplPlayers.position,
          clubShort: fplPlayers.clubShort,
          totalPoints: fplPlayers.totalPoints,
          form: fplPlayers.form,
          // Fed to the suggestion engine, which values a player on what he
          // actually did last season rather than one gameweek of noise.
          lastSeasonPoints: fplPlayers.lastSeasonPoints,
          draftRank: fplPlayers.draftRank,
        })
        .from(fplPlayers)
        .where(inArray(fplPlayers.fplId, ids))
    : [];
  const playerById = new Map(players.map((p) => [p.fplId, p]));

  const squadsOut = squadRows.map((s) => ({
    userId: s.userId,
    username: s.username,
    isBot: s.isBot,
    players: owned
      .filter((o) => o.squadId === s.squadId)
      .map((o) => playerById.get(o.fplId))
      .filter(Boolean),
  }));

  const tradeRows = await db
    .select()
    .from(trades)
    .where(eq(trades.leagueId, leagueId))
    .orderBy(desc(trades.proposedAt))
    .limit(40);
  const nameById = new Map(squadRows.map((s) => [s.userId, s.username]));

  return NextResponse.json({
    vetoEnabled: league.vetoEnabled,
    isOwner: league.ownerId === userId,
    squads: squadsOut,
    trades: tradeRows.map((t) => ({
      id: t.id,
      proposerId: t.proposerId,
      proposerName: nameById.get(t.proposerId) ?? '?',
      receiverId: t.receiverId,
      receiverName: nameById.get(t.receiverId) ?? '?',
      offer: t.offerFplIds.map((id) => playerById.get(id)?.webName ?? `#${id}`),
      request: t.requestFplIds.map((id) => playerById.get(id)?.webName ?? `#${id}`),
      status: t.status,
      proposedAt: t.proposedAt.toISOString(),
      executesAt: t.executesAt?.toISOString() ?? null,
    })),
  });
}

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('propose'),
    receiverId: z.string().uuid(),
    offerFplIds: z.array(z.number().int().positive()).min(1).max(3),
    requestFplIds: z.array(z.number().int().positive()).min(1).max(3),
  }),
  z.object({ action: z.literal('accept'), tradeId: z.string().uuid() }),
  z.object({ action: z.literal('reject'), tradeId: z.string().uuid() }),
  z.object({ action: z.literal('cancel'), tradeId: z.string().uuid() }),
  z.object({ action: z.literal('veto'), tradeId: z.string().uuid() }),
]);

export async function POST(req: Request, ctx: { params: Promise<{ leagueId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  const { leagueId } = await ctx.params;
  if (!(await isLeagueMember(userId, leagueId))) {
    return NextResponse.json({ error: 'not a member' }, { status: 403 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  const body = parsed.data;

  try {
    if (body.action === 'propose') {
      const id = await proposeTrade(leagueId, userId, body.receiverId, body.offerFplIds, body.requestFplIds);
      return NextResponse.json({ tradeId: id });
    }
    if (body.action === 'accept') await respondTrade(body.tradeId, userId, true);
    if (body.action === 'reject') await respondTrade(body.tradeId, userId, false);
    if (body.action === 'cancel') await cancelTrade(body.tradeId, userId);
    if (body.action === 'veto') await vetoTrade(body.tradeId, userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TradeError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed' },
      { status: 500 },
    );
  }
}
