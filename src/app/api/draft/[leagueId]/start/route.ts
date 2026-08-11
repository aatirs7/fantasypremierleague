import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { DraftError, startDraft } from '@/lib/draft';

export async function POST(_req: Request, ctx: { params: Promise<{ leagueId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  const { leagueId } = await ctx.params;
  try {
    await startDraft(leagueId, userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DraftError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'start failed' },
      { status: 500 },
    );
  }
}
