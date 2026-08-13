import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserId } from '@/lib/auth';
import { isLeagueMember } from '@/lib/leagues';
import { postMessage, recentMessages } from '@/lib/chat';

export async function GET(_req: Request, ctx: { params: Promise<{ leagueId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  const { leagueId } = await ctx.params;
  if (!(await isLeagueMember(userId, leagueId))) {
    return NextResponse.json({ error: 'not a member' }, { status: 403 });
  }
  return NextResponse.json({ messages: await recentMessages(leagueId) });
}

const Body = z.object({ body: z.string().trim().min(1).max(500) });

export async function POST(req: Request, ctx: { params: Promise<{ leagueId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  const { leagueId } = await ctx.params;
  if (!(await isLeagueMember(userId, leagueId))) {
    return NextResponse.json({ error: 'not a member' }, { status: 403 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'say something first' }, { status: 400 });
  await postMessage(leagueId, userId, parsed.data.body);
  return NextResponse.json({ messages: await recentMessages(leagueId) });
}
