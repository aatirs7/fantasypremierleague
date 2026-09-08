import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fplPlayers, squadPlayers, squads, users } from '@/lib/schema';
import { currentUserId } from '@/lib/auth';
import { isLeagueMember } from '@/lib/leagues';
import { WaiverError, signFreeAgent, signingWindow } from '@/lib/waivers';

// GET: who is taken, who is on your squad, and the recent signings feed.
// There is no claim queue and no priority order any more: any unowned player
// can be signed immediately, so the only state worth sending is ownership.
export async function GET(_req: Request, ctx: { params: Promise<{ leagueId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  const { leagueId } = await ctx.params;
  if (!(await isLeagueMember(userId, leagueId))) {
    return NextResponse.json({ error: 'not a member' }, { status: 403 });
  }

  const win = await signingWindow();

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
        .select({
          fplId: fplPlayers.fplId,
          webName: fplPlayers.webName,
          position: fplPlayers.position,
          clubShort: fplPlayers.clubShort,
        })
        .from(fplPlayers)
        .where(inArray(fplPlayers.fplId, myIds))
    : [];

  // Recent business in the league, so a signing is visible to everyone.
  const recent = await db
    .select({
      fplId: squadPlayers.fplId,
      acquiredGw: squadPlayers.acquiredGw,
      username: users.username,
      webName: fplPlayers.webName,
      position: fplPlayers.position,
      clubShort: fplPlayers.clubShort,
    })
    .from(squadPlayers)
    .innerJoin(squads, eq(squads.id, squadPlayers.squadId))
    .innerJoin(users, eq(users.id, squads.userId))
    .innerJoin(fplPlayers, eq(fplPlayers.fplId, squadPlayers.fplId))
    .where(
      and(
        eq(squadPlayers.leagueId, leagueId),
        isNull(squadPlayers.droppedGw),
        inArray(squadPlayers.acquiredVia, ['free_agent', 'waiver']),
      ),
    )
    .orderBy(desc(squadPlayers.id))
    .limit(20);

  return NextResponse.json({
    takenIds: owned.map((o) => o.fplId),
    mySquad: myPlayers,
    window: win
      ? { upcomingGw: win.upcomingGw, deadline: win.deadline.toISOString(), open: win.open }
      : null,
    recent,
  });
}

const Body = z.object({
  action: z.literal('sign'),
  addFplId: z.number().int().positive(),
  dropFplId: z.number().int().positive(),
});

export async function POST(req: Request, ctx: { params: Promise<{ leagueId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  const { leagueId } = await ctx.params;
  if (!(await isLeagueMember(userId, leagueId))) {
    return NextResponse.json({ error: 'not a member' }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  try {
    await signFreeAgent(leagueId, userId, parsed.data.addFplId, parsed.data.dropFplId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof WaiverError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Could not complete the signing' }, { status: 500 });
  }
}
