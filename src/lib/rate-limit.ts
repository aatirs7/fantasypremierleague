import 'server-only';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from './db';
import { loginAttempts } from './schema';

// Login throttling backed by Neon (Vercel functions share no memory).
// Two rules from the spec:
//   - 10 attempts per IP per minute
//   - 5 consecutive failures for a username triggers a 60s lockout
// Failures are recorded per key; a successful login clears the user key so
// "consecutive" resets. The cron deletes rows older than an hour.

const IP_LIMIT = 10;
const IP_WINDOW_MS = 60_000;
const USER_LIMIT = 5;
const USER_LOCKOUT_MS = 60_000;

async function countSince(key: string, sinceMs: number): Promise<number> {
  const since = new Date(Date.now() - sinceMs);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.key, key), gt(loginAttempts.at, since)));
  return row?.n ?? 0;
}

export async function loginBlocked(ip: string, usernameLower: string): Promise<string | null> {
  const [ipCount, userCount] = await Promise.all([
    countSince(`ip:${ip}`, IP_WINDOW_MS),
    countSince(`user:${usernameLower}`, USER_LOCKOUT_MS),
  ]);
  if (ipCount >= IP_LIMIT) return 'Too many attempts. Wait a minute and try again.';
  if (userCount >= USER_LIMIT) return 'Too many wrong PINs. Locked for 60 seconds.';
  return null;
}

export async function recordFailure(ip: string, usernameLower: string): Promise<void> {
  await db.insert(loginAttempts).values([{ key: `ip:${ip}` }, { key: `user:${usernameLower}` }]);
}

export async function recordAttempt(ip: string): Promise<void> {
  await db.insert(loginAttempts).values({ key: `ip:${ip}` });
}

export async function clearUserFailures(usernameLower: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, `user:${usernameLower}`));
}

export function requestIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return fwd ? fwd.split(',')[0].trim() : 'unknown';
}
