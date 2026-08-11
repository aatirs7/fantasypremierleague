import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { lineups, squads } from '@/lib/schema';
import { currentUserId } from '@/lib/auth';
import { editableGw, squadMembers } from '@/lib/lineup';
import { validateLineup } from '@/lib/lineup-rules';

const Body = z.object({
  squadId: z.string().uuid(),
  gw: z.number().int().min(1).max(38),
  picks: z
    .array(
      z.object({
        fplId: z.number().int().positive(),
        slot: z.number().int().min(1).max(15),
        starting: z.boolean(),
        isCaptain: z.boolean(),
        isVice: z.boolean(),
      }),
    )
    .length(15),
});

// Save a manual lineup. Formation validated server-side, locked at the
// GW deadline (straight from the synced gameweeks table).
export async function PUT(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  const { squadId, gw, picks } = parsed.data;

  const [squad] = await db.select().from(squads).where(eq(squads.id, squadId)).limit(1);
  if (!squad || squad.userId !== userId) {
    return NextResponse.json({ error: 'not your squad' }, { status: 403 });
  }

  const editable = await editableGw();
  if (!editable || editable.gw !== gw) {
    return NextResponse.json({ error: 'That gameweek is locked' }, { status: 409 });
  }
  if (editable.deadline.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Deadline has passed' }, { status: 409 });
  }

  const members = await squadMembers(squadId);
  const err = validateLineup(
    picks,
    new Map(members.map((m) => [m.fplId, m.position])),
    new Set(members.map((m) => m.fplId)),
  );
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  await db
    .insert(lineups)
    .values({ squadId, gw, picks, autoSet: false, setAt: new Date() })
    .onConflictDoUpdate({
      target: [lineups.squadId, lineups.gw],
      set: { picks, autoSet: false, setAt: new Date() },
    });
  return NextResponse.json({ ok: true });
}
