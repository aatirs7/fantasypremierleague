import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { leagueMembers, leagues, loginAttempts, users } from '@/lib/schema';
import { PIN_RE, currentUserId } from '@/lib/auth';

const Body = z.object({
  userId: z.string().uuid(),
  newPin: z.string().regex(PIN_RE, 'PIN must be 4 digits'),
});

// A league owner resets a member's PIN.
//
// There is no email on any account, so a self-service reset link is
// impossible. In a league among friends the owner already knows everyone, so
// they are the right person to vouch for an identity: they set a new PIN and
// tell the member in person. Only members of the owner's own league, and
// never the owner's own account through this route.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ownerId = await currentUserId();
  if (!ownerId) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const { id: leagueId } = await ctx.params;

  const [league] = await db
    .select({ ownerId: leagues.ownerId })
    .from(leagues)
    .where(eq(leagues.id, leagueId))
    .limit(1);
  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
  if (league.ownerId !== ownerId) {
    return NextResponse.json({ error: 'Only the league owner can reset PINs' }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  const { userId, newPin } = parsed.data;
  if (userId === ownerId) {
    return NextResponse.json({ error: 'Change your own PIN from your profile' }, { status: 400 });
  }

  const [member] = await db
    .select({ userId: leagueMembers.userId })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)))
    .limit(1);
  if (!member) return NextResponse.json({ error: 'That manager is not in this league' }, { status: 404 });

  const [target] = await db
    .select({ usernameLower: users.usernameLower })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  await db
    .update(users)
    .set({ pinHash: await bcrypt.hash(newPin, 10) })
    .where(eq(users.id, userId));
  // Whoever was locked out from guessing should not stay locked out once the
  // owner has vouched for them.
  await db.delete(loginAttempts).where(eq(loginAttempts.key, `user:${target.usernameLower}`));

  return NextResponse.json({ ok: true });
}
