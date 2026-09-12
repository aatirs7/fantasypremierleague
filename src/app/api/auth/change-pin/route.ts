import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { PIN_RE, readSession } from '@/lib/auth';
import { setPin } from '@/lib/pin-reset';
import { loginBlocked, recordFailure, requestIp } from '@/lib/rate-limit';

// Signed-in managers can swap their PIN, proving the current one first.
// Wrong guesses count toward the same lockout as failed logins.

const Body = z.object({
  currentPin: z.string().regex(PIN_RE, 'Current PIN must be exactly 4 digits'),
  newPin: z.string().regex(PIN_RE, 'New PIN must be exactly 4 digits'),
});

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid input' }, { status: 400 });
  }
  const { currentPin, newPin } = parsed.data;
  if (currentPin === newPin) {
    return NextResponse.json({ error: 'New PIN is the same as the old one' }, { status: 400 });
  }

  const lower = session.username.toLowerCase();
  const ip = requestIp(req);
  const blocked = await loginBlocked(ip, lower);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 429 });

  const [user] = await db
    .select({ id: users.id, pinHash: users.pinHash })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  if (!(await bcrypt.compare(currentPin, user.pinHash))) {
    await recordFailure(ip, lower);
    return NextResponse.json({ error: 'Current PIN is wrong' }, { status: 401 });
  }

  await setPin(user.id, newPin);
  return NextResponse.json({ ok: true });
}
