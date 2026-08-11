import 'server-only';
import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { EncryptJWT, jwtDecrypt } from 'jose';

// Username + 4-digit PIN auth with an encrypted session cookie.
// The cookie payload is { userId, username }, encrypted (not just signed)
// with a key derived from SESSION_SECRET, 30 day max age.

export const AUTH_COOKIE = 'epld_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export type Session = { userId: string; username: string };

function sessionKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET is not set (needs 32+ chars)');
  }
  // Hash the secret down to exactly 32 bytes for A256GCM.
  return new Uint8Array(createHash('sha256').update(secret).digest());
}

export async function createSessionCookie(session: Session): Promise<string> {
  return await new EncryptJWT(session)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .encrypt(sessionKey());
}

export async function readSession(): Promise<Session | null> {
  const jar = await cookies();
  const raw = jar.get(AUTH_COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtDecrypt(raw, sessionKey());
    if (typeof payload.userId !== 'string' || typeof payload.username !== 'string') return null;
    return { userId: payload.userId, username: payload.username };
  } catch {
    // Tampered, expired, or from an old secret: act signed out.
    return null;
  }
}

export async function currentUserId(): Promise<string | null> {
  const s = await readSession();
  return s?.userId ?? null;
}

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
export const PIN_RE = /^\d{4}$/;
