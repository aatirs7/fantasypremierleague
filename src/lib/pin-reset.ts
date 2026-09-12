import 'server-only';
import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { users } from './schema';

// Admin-issued PIN reset codes. There is no email or phone on file, so a
// forgotten PIN is recovered by the admin generating a short one-time code
// here and passing it to the manager directly (WhatsApp, in person). The
// manager then enters username + code + a new PIN on the sign-in screen.
// Only the bcrypt hash is stored; the plain code is shown to the admin once.

export const RESET_CODE_RE = /^[A-Z0-9]{6}$/;
export const RESET_CODE_TTL_MS = 24 * 60 * 60 * 1000;

// No 0/O or 1/I so the code survives being read out loud.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateResetCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export async function issueResetCode(userId: string): Promise<{ code: string; expiresAt: Date }> {
  const code = generateResetCode();
  const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);
  const pinResetHash = await bcrypt.hash(code, 10);
  await db.update(users).set({ pinResetHash, pinResetExpiresAt: expiresAt }).where(eq(users.id, userId));
  return { code, expiresAt };
}

export async function setPin(userId: string, pin: string): Promise<void> {
  const pinHash = await bcrypt.hash(pin, 10);
  // Any outstanding reset code dies with the old PIN.
  await db
    .update(users)
    .set({ pinHash, pinResetHash: null, pinResetExpiresAt: null })
    .where(eq(users.id, userId));
}
