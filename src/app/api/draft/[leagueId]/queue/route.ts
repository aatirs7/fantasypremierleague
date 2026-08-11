import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { draftQueues } from '@/lib/schema';
import { currentUserId } from '@/lib/auth';
import { isLeagueMember } from '@/lib/leagues';

// The manager's private pre-draft queue for this league. GET returns the
// ordered fplIds; PUT replaces the whole list (client owns the ordering).
export async function GET(_req: Request, ctx: { params: Promise<{ leagueId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  const { leagueId } = await ctx.params;
  if (!(await isLeagueMember(userId, leagueId))) {
    return NextResponse.json({ error: 'not a member' }, { status: 403 });
  }
  const rows = await db
    .select({ fplId: draftQueues.fplId })
    .from(draftQueues)
    .where(and(eq(draftQueues.leagueId, leagueId), eq(draftQueues.userId, userId)))
    .orderBy(asc(draftQueues.rank));
  return NextResponse.json({ fplIds: rows.map((r) => r.fplId) });
}

const Body = z.object({ fplIds: z.array(z.number().int().positive()).max(50) });

export async function PUT(req: Request, ctx: { params: Promise<{ leagueId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  const { leagueId } = await ctx.params;
  if (!(await isLeagueMember(userId, leagueId))) {
    return NextResponse.json({ error: 'not a member' }, { status: 403 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  const unique = [...new Set(parsed.data.fplIds)];

  await db
    .delete(draftQueues)
    .where(and(eq(draftQueues.leagueId, leagueId), eq(draftQueues.userId, userId)));
  if (unique.length) {
    await db
      .insert(draftQueues)
      .values(unique.map((fplId, i) => ({ leagueId, userId, fplId, rank: i + 1 })));
  }
  return NextResponse.json({ ok: true });
}
