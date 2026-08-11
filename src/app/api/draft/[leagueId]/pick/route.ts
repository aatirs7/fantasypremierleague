import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserId } from '@/lib/auth';
import { DraftError, makePick } from '@/lib/draft';

const Body = z.object({
  fplId: z.number().int().positive(),
  pickNumber: z.number().int().positive(),
});

export async function POST(req: Request, ctx: { params: Promise<{ leagueId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  const { leagueId } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  try {
    await makePick(leagueId, userId, parsed.data.fplId, parsed.data.pickNumber);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DraftError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'pick failed' },
      { status: 500 },
    );
  }
}
