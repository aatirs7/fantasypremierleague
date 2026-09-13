import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { PIN_RE, currentUserId } from '@/lib/auth';

const Body = z.object({
  currentPin: z.string().regex(PIN_RE, 'Current PIN must be 4 digits'),
  newPin: z.string().regex(PIN_RE, 'New PIN must be 4 digits'),
});

// Change your own PIN. Asks for the current one, so a phone left unlocked on
// a table cannot be used to lock its owner out.
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  const { currentPin, newPin } = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !(await bcrypt.compare(currentPin, user.pinHash))) {
    return NextResponse.json({ error: 'That is not your current PIN' }, { status: 403 });
  }
  await db
    .update(users)
    .set({ pinHash: await bcrypt.hash(newPin, 10) })
    .where(eq(users.id, userId));
  return NextResponse.json({ ok: true });
}
