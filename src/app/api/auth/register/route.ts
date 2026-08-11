import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { AUTH_COOKIE, PIN_RE, SESSION_MAX_AGE, USERNAME_RE, createSessionCookie } from '@/lib/auth';
import { recordAttempt, requestIp } from '@/lib/rate-limit';

const Body = z.object({
  username: z.string().regex(USERNAME_RE, 'Username must be 3-20 letters, numbers, or underscores'),
  pin: z.string().regex(PIN_RE, 'PIN must be exactly 4 digits'),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid input' }, { status: 400 });
  }
  const { username, pin } = parsed.data;
  const lower = username.toLowerCase();

  await recordAttempt(requestIp(req));

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.usernameLower, lower))
    .limit(1);
  if (existing) {
    return NextResponse.json({ error: 'That username is taken' }, { status: 409 });
  }

  const pinHash = await bcrypt.hash(pin, 10);
  let created;
  try {
    [created] = await db.insert(users).values({ username, usernameLower: lower, pinHash }).returning();
  } catch {
    // Unique-violation race: someone registered the name between check and insert.
    return NextResponse.json({ error: 'That username is taken' }, { status: 409 });
  }

  const token = await createSessionCookie({ userId: created.id, username: created.username });
  const res = NextResponse.json({ user: { id: created.id, username: created.username } });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  return res;
}
