import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { squads, users } from '@/lib/schema';
import { AUTH_COOKIE, PIN_RE, SESSION_MAX_AGE, createSessionCookie } from '@/lib/auth';
import { clearUserFailures, loginBlocked, recordFailure, requestIp } from '@/lib/rate-limit';

// The field takes a username OR a team name. Team names replaced usernames
// everywhere in the app, so nobody sees their username any more and people
// naturally type the name they do see. Team names can hold spaces and
// apostrophes, so this is looser than the signup username rule.
const Body = z.object({
  username: z.string().trim().min(1, 'Enter your username or team name').max(40),
  pin: z.string().regex(PIN_RE, 'PIN must be exactly 4 digits'),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid input' }, { status: 400 });
  }
  const { username, pin } = parsed.data;
  const lower = username.toLowerCase();
  const ip = requestIp(req);

  // Username first, since it is unique. Failing that, a team name, which is
  // only accepted when exactly one manager uses it: two leagues could both
  // have a "United", and guessing between them would log someone in as a
  // stranger.
  let [user] = await db.select().from(users).where(eq(users.usernameLower, lower)).limit(1);
  if (!user) {
    const byTeam = await db
      .selectDistinct({ userId: squads.userId })
      .from(squads)
      .where(sql`lower(${squads.name}) = ${lower}`);
    if (byTeam.length === 1) {
      [user] = await db.select().from(users).where(eq(users.id, byTeam[0].userId)).limit(1);
    }
  }
  // The lockout counts against the account, not the words typed. Keyed on
  // the text instead, a username and a team name would be two separate
  // counters for the same PIN, doubling the guesses anyone gets.
  const limitKey = user?.usernameLower ?? lower;
  const blocked = await loginBlocked(ip, limitKey);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 429 });

  // Same error for unknown user and wrong PIN so usernames cannot be probed.
  const ok = user && !user.isBot && (await bcrypt.compare(pin, user.pinHash));
  if (!ok) {
    await recordFailure(ip, limitKey);
    return NextResponse.json({ error: 'Wrong username, team name or PIN' }, { status: 401 });
  }

  await clearUserFailures(user.usernameLower);
  const token = await createSessionCookie({ userId: user.id, username: user.username });
  const res = NextResponse.json({ user: { id: user.id, username: user.username } });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  return res;
}
