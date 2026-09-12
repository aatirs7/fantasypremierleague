import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { PIN_RE, readSession } from '@/lib/auth';
import { clearUserFailures } from '@/lib/rate-limit';

const Body = z.object({
  pin: z.string().regex(PIN_RE, 'PIN must be exactly 4 digits'),
});

// Change the PIN for the signed-in user. The session cookie is the proof
// of identity, so no current PIN is required: this is how someone who is
// still signed in on their phone recovers a PIN they have forgotten.
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'sign in first' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid input' }, { status: 400 });
  }

  const pinHash = await bcrypt.hash(parsed.data.pin, 10);
  const [updated] = await db
    .update(users)
    .set({ pinHash })
    .where(eq(users.id, session.userId))
    .returning({ usernameLower: users.usernameLower });
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await clearUserFailures(updated.usernameLower);
  return NextResponse.json({ ok: true });
}
