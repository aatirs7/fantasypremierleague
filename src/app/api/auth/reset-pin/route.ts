import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { AUTH_COOKIE, PIN_RE, SESSION_MAX_AGE, USERNAME_RE, createSessionCookie } from '@/lib/auth';
import { RESET_CODE_RE, setPin } from '@/lib/pin-reset';
import { clearUserFailures, loginBlocked, recordFailure, requestIp } from '@/lib/rate-limit';

// Self-service half of the PIN reset: the manager enters their username,
// the one-time code the admin gave them, and a new PIN. Shares the login
// throttle so codes cannot be brute forced any faster than PINs.

const Body = z.object({
  username: z.string().regex(USERNAME_RE, 'Invalid username'),
  code: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .pipe(z.string().regex(RESET_CODE_RE, 'Reset code is 6 letters or numbers')),
  pin: z.string().regex(PIN_RE, 'PIN must be exactly 4 digits'),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid input' }, { status: 400 });
  }
  const { username, code, pin } = parsed.data;
  const lower = username.toLowerCase();
  const ip = requestIp(req);

  const blocked = await loginBlocked(ip, lower);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 429 });

  const [user] = await db.select().from(users).where(eq(users.usernameLower, lower)).limit(1);
  // One error for every failure mode so nothing about the account leaks.
  const live =
    user &&
    !user.isBot &&
    user.pinResetHash &&
    user.pinResetExpiresAt &&
    user.pinResetExpiresAt.getTime() > Date.now();
  const ok = live && (await bcrypt.compare(code, user.pinResetHash as string));
  if (!ok) {
    await recordFailure(ip, lower);
    return NextResponse.json({ error: 'Wrong username or reset code' }, { status: 401 });
  }

  await setPin(user.id, pin);
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
