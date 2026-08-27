import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { squads } from '@/lib/schema';
import { currentUserId } from '@/lib/auth';

const Body = z.object({
  squadId: z.string().uuid(),
  name: z.string().trim().min(2).max(24),
});

// Rename your own team. Nothing else about a squad is editable.
export async function PATCH(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Team names are 2 to 24 characters' }, { status: 400 });
  }
  const { squadId, name } = parsed.data;
  const [updated] = await db
    .update(squads)
    .set({ name })
    .where(and(eq(squads.id, squadId), eq(squads.userId, userId)))
    .returning({ id: squads.id, name: squads.name });
  if (!updated) return NextResponse.json({ error: 'Not your squad' }, { status: 403 });
  return NextResponse.json({ ok: true, name: updated.name });
}
