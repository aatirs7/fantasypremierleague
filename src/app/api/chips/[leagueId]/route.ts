import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserId } from '@/lib/auth';
import { isLeagueMember } from '@/lib/leagues';
import { editableGw } from '@/lib/lineup';
import { CHIP_KINDS, ChipError, cancelChip, chipsForUser, playChip } from '@/lib/chips';

export async function GET(_req: Request, ctx: { params: Promise<{ leagueId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  const { leagueId } = await ctx.params;
  if (!(await isLeagueMember(userId, leagueId))) {
    return NextResponse.json({ error: 'not a member' }, { status: 403 });
  }
  const played = await chipsForUser(leagueId, userId);
  const gw = await editableGw();
  return NextResponse.json({
    played: played.map((c) => ({ chip: c.chip, gw: c.gw })),
    editableGw: gw?.gw ?? null,
  });
}

const Body = z.object({
  action: z.enum(['play', 'cancel']),
  chip: z.enum(CHIP_KINDS),
});

export async function POST(req: Request, ctx: { params: Promise<{ leagueId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  const { leagueId } = await ctx.params;
  if (!(await isLeagueMember(userId, leagueId))) {
    return NextResponse.json({ error: 'not a member' }, { status: 403 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });

  const gw = await editableGw();
  if (!gw) return NextResponse.json({ error: 'The season is over' }, { status: 409 });

  try {
    if (parsed.data.action === 'play') {
      await playChip(leagueId, userId, parsed.data.chip, gw.gw);
    } else {
      await cancelChip(leagueId, userId, parsed.data.chip, gw.gw);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ChipError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed' },
      { status: 500 },
    );
  }
}
