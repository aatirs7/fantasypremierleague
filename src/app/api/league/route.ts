import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { leagueMembers, leagues, users } from '@/lib/schema';
import { PIN_RE, currentUserId } from '@/lib/auth';
import { generateJoinCode } from '@/lib/leagues';
import { clearUserFailures } from '@/lib/rate-limit';

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    name: z.string().trim().min(1).max(60),
    vetoEnabled: z.boolean().optional(),
  }),
  z.object({ action: z.literal('join'), code: z.string().trim().min(4).max(12) }),
  z.object({
    action: z.literal('schedule'),
    leagueId: z.string().uuid(),
    // ISO timestamp for the draft, or null to clear.
    draftTime: z.string().datetime({ offset: true }).nullable(),
  }),
  z.object({
    action: z.literal('reset-pin'),
    leagueId: z.string().uuid(),
    userId: z.string().uuid(),
    pin: z.string().regex(PIN_RE, 'PIN must be exactly 4 digits'),
  }),
]);

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'sign in first' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  const body = parsed.data;

  if (body.action === 'create') {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const [league] = await db
          .insert(leagues)
          .values({
            name: body.name,
            joinCode: generateJoinCode(),
            ownerId: userId,
            vetoEnabled: body.vetoEnabled ?? false,
          })
          .returning();
        await db
          .insert(leagueMembers)
          .values({ leagueId: league.id, userId })
          .onConflictDoNothing();
        return NextResponse.json({ league });
      } catch {
        // join_code unique violation: retry with a fresh code
      }
    }
    return NextResponse.json({ error: 'could not create league' }, { status: 500 });
  }

  if (body.action === 'join') {
    const code = body.code.toUpperCase();
    const [league] = await db.select().from(leagues).where(eq(leagues.joinCode, code)).limit(1);
    if (!league) return NextResponse.json({ error: 'No league with that code' }, { status: 404 });
    if (league.draftStatus !== 'pending') {
      return NextResponse.json({ error: 'This league has already drafted' }, { status: 409 });
    }
    await db
      .insert(leagueMembers)
      .values({ leagueId: league.id, userId })
      .onConflictDoNothing();
    return NextResponse.json({ league });
  }

  if (body.action === 'reset-pin') {
    // There is no email, so a forgotten PIN is fixed by the league owner:
    // they set a fresh 4-digit PIN for a member of their own league.
    const [league] = await db.select().from(leagues).where(eq(leagues.id, body.leagueId)).limit(1);
    if (!league) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (league.ownerId !== userId) {
      return NextResponse.json({ error: 'Only the league owner can reset a PIN' }, { status: 403 });
    }
    const [membership] = await db
      .select({ userId: leagueMembers.userId })
      .from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, league.id), eq(leagueMembers.userId, body.userId)))
      .limit(1);
    if (!membership) return NextResponse.json({ error: 'Not a member of this league' }, { status: 404 });
    const [target] = await db.select().from(users).where(eq(users.id, body.userId)).limit(1);
    if (!target || target.isBot) return NextResponse.json({ error: 'Not a member of this league' }, { status: 404 });

    const pinHash = await bcrypt.hash(body.pin, 10);
    await db.update(users).set({ pinHash }).where(eq(users.id, target.id));
    // A locked-out member should be able to use the new PIN right away.
    await clearUserFailures(target.usernameLower);
    return NextResponse.json({ ok: true, username: target.username });
  }

  // schedule
  const [league] = await db.select().from(leagues).where(eq(leagues.id, body.leagueId)).limit(1);
  if (!league) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (league.ownerId !== userId) {
    return NextResponse.json({ error: 'Only the owner can schedule the draft' }, { status: 403 });
  }
  if (league.draftStatus !== 'pending') {
    return NextResponse.json({ error: 'Draft already started' }, { status: 409 });
  }
  const [updated] = await db
    .update(leagues)
    .set({ draftTime: body.draftTime ? new Date(body.draftTime) : null })
    .where(eq(leagues.id, body.leagueId))
    .returning();
  return NextResponse.json({ league: updated });
}
