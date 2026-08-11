import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { AUTH_COOKIE, PIN_RE, SESSION_MAX_AGE, USERNAME_RE, createSessionCookie } from '@/lib/auth';
import { clearUserFailures, loginBlocked, recordFailure, requestIp } from '@/lib/rate-limit';

const Body = z.object({
  username: z.string().regex(USERNAME_RE, 'Invalid username'),
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

  const blocked = await loginBlocked(ip, lower);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 429 });

  const [user] = await db.select().from(users).where(eq(users.usernameLower, lower)).limit(1);
  // Same error for unknown user and wrong PIN so usernames cannot be probed.
  const ok = user && !user.isBot && (await bcrypt.compare(pin, user.pinHash));
  if (!ok) {
    await recordFailure(ip, lower);
    return NextResponse.json({ error: 'Wrong username or PIN' }, { status: 401 });
  }

  await clearUserFailures(lower);
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
