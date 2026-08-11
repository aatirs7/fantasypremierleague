import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fplPlayers, squadPlayers, squads, users, waiverClaims, waiverLocks, waiverPriority } from '@/lib/schema';
import { isNull } from 'drizzle-orm';
import { currentUserId } from '@/lib/auth';
import { isLeagueMember } from '@/lib/leagues';
import { WaiverError, ensurePriority, freeAgentMove, waiverWindow } from '@/lib/waivers';

// GET: window status, my claim queue, league priority order, results feed.
export async function GET(_req: Request, ctx: { params: Promise<{ leagueId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  const { leagueId } = await ctx.params;
  if (!(await isLeagueMember(userId, leagueId))) {
    return NextResponse.json({ error: 'not a member' }, { status: 403 });
  }

  await ensurePriority(leagueId);
  const win = await waiverWindow();

  const priority = await db
    .select({ userId: waiverPriority.userId, priority: waiverPriority.priority, username: users.username })
    .from(waiverPriority)
    .innerJoin(users, eq(users.id, waiverPriority.userId))
    .where(eq(waiverPriority.leagueId, leagueId))
    .orderBy(asc(waiverPriority.priority));

  const myClaims = win
    ? await db
        .select()
        .from(waiverClaims)
        .where(
          and(
            eq(waiverClaims.leagueId, leagueId),
            eq(waiverClaims.userId, userId),
            eq(waiverClaims.gw, win.upcomingGw),
          ),
        )
        .orderBy(asc(waiverClaims.userRank))
    : [];

  const results = await db
    .select({
      id: waiverClaims.id,
      userId: waiverClaims.userId,
      username: users.username,
      addFplId: waiverClaims.addFplId,
      dropFplId: waiverClaims.dropFplId,
      status: waiverClaims.status,
      rejectReason: waiverClaims.rejectReason,
      gw: waiverClaims.gw,
      processedAt: waiverClaims.processedAt,
    })
    .from(waiverClaims)
    .innerJoin(users, eq(users.id, waiverClaims.userId))
    .where(and(eq(waiverClaims.leagueId, leagueId), inArray(waiverClaims.status, ['approved', 'rejected'])))
    .orderBy(desc(waiverClaims.processedAt))
    .limit(30);

  const ids = [
    ...new Set([
      ...myClaims.flatMap((c) => [c.addFplId, c.dropFplId]),
      ...results.flatMap((c) => [c.addFplId, c.dropFplId]),
    ]),
  ];
  const names = ids.length
    ? await db
        .select({ fplId: fplPlayers.fplId, webName: fplPlayers.webName, position: fplPlayers.position })
        .from(fplPlayers)
        .where(inArray(fplPlayers.fplId, ids))
    : [];

  const owned = await db
    .select({ fplId: squadPlayers.fplId, squadId: squadPlayers.squadId })
    .from(squadPlayers)
    .where(and(eq(squadPlayers.leagueId, leagueId), isNull(squadPlayers.droppedGw)));
  const [mySquad] = await db
    .select({ id: squads.id })
    .from(squads)
    .where(and(eq(squads.leagueId, leagueId), eq(squads.userId, userId)))
    .limit(1);
  const myIds = mySquad ? owned.filter((o) => o.squadId === mySquad.id).map((o) => o.fplId) : [];
  const myPlayers = myIds.length
    ? await db
        .select({ fplId: fplPlayers.fplId, webName: fplPlayers.webName, position: fplPlayers.position })
        .from(fplPlayers)
        .where(inArray(fplPlayers.fplId, myIds))
    : [];
  const locks = await db
    .select({ fplId: waiverLocks.fplId })
    .from(waiverLocks)
    .where(eq(waiverLocks.leagueId, leagueId));

  return NextResponse.json({
    takenIds: owned.map((o) => o.fplId),
    lockedIds: locks.map((l) => l.fplId),
    mySquad: myPlayers,
    window: win
      ? {
          upcomingGw: win.upcomingGw,
          deadline: win.deadline.toISOString(),
          closesAt: win.closesAt.toISOString(),
          opensNow: win.opensNow,
          freeAgencyNow: win.freeAgencyNow,
          processed: win.processed,
        }
      : null,
    priority,
    myClaims,
    results,
    playerNames: Object.fromEntries(names.map((n) => [n.fplId, { webName: n.webName, position: n.position }])),
  });
}

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('claim'),
    addFplId: z.number().int().positive(),
    dropFplId: z.number().int().positive(),
  }),
  z.object({ action: z.literal('cancel'), claimId: z.string().uuid() }),
  z.object({ action: z.literal('reorder'), claimIds: z.array(z.string().uuid()).max(20) }),
  z.object({
    action: z.literal('free_agent'),
    addFplId: z.number().int().positive(),
    dropFplId: z.number().int().positive(),
  }),
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
    if (body.action === 'claim') {
      const win = await waiverWindow();
      if (!win || !win.opensNow) {
        return NextResponse.json({ error: 'The waiver window is not open' }, { status: 409 });
      }
      const existing = await db
        .select({ userRank: waiverClaims.userRank })
        .from(waiverClaims)
        .where(
          and(
            eq(waiverClaims.leagueId, leagueId),
            eq(waiverClaims.userId, userId),
            eq(waiverClaims.gw, win.upcomingGw),
            eq(waiverClaims.status, 'pending'),
          ),
        );
      const nextRank = Math.max(0, ...existing.map((c) => c.userRank)) + 1;
      const [claim] = await db
        .insert(waiverClaims)
        .values({
          leagueId,
          userId,
          gw: win.upcomingGw,
          addFplId: body.addFplId,
          dropFplId: body.dropFplId,
          userRank: nextRank,
        })
        .returning();
      return NextResponse.json({ claim });
    }

    if (body.action === 'cancel') {
      const [claim] = await db
        .select()
        .from(waiverClaims)
        .where(eq(waiverClaims.id, body.claimId))
        .limit(1);
      if (!claim || claim.userId !== userId || claim.leagueId !== leagueId) {
        return NextResponse.json({ error: 'not found' }, { status: 404 });
      }
      if (claim.status !== 'pending') {
        return NextResponse.json({ error: 'Already processed' }, { status: 409 });
      }
      await db
        .update(waiverClaims)
        .set({ status: 'cancelled', processedAt: new Date() })
        .where(eq(waiverClaims.id, body.claimId));
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'reorder') {
      for (let i = 0; i < body.claimIds.length; i++) {
        await db
          .update(waiverClaims)
          .set({ userRank: i + 1 })
          .where(
            and(
              eq(waiverClaims.id, body.claimIds[i]),
              eq(waiverClaims.userId, userId),
              eq(waiverClaims.leagueId, leagueId),
              eq(waiverClaims.status, 'pending'),
            ),
          );
      }
      return NextResponse.json({ ok: true });
    }

    // free_agent
    await freeAgentMove(leagueId, userId, body.addFplId, body.dropFplId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof WaiverError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed' },
      { status: 500 },
    );
  }
}
