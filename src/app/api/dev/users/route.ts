import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { and, eq, ilike, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { leagueMembers, leagues, users } from '@/lib/schema';
import { currentAdminId } from '@/lib/admin';
import { PIN_RE, USERNAME_RE } from '@/lib/auth';
import { clearUserFailures } from '@/lib/rate-limit';

// Admin-only account recovery. There is no self-service PIN reset by design
// (no email, no phone), so when a manager forgets their PIN they message the
// admin, who looks the account up here and sets a fresh PIN for them.
// Non-admins get a 404 so the surface stays invisible.

// GET /api/dev/users?q=brown
// Finds real (non-bot) accounts whose username contains q, with the leagues
// they belong to, so a half-remembered name can be matched to an account.
export async function GET(req: Request) {
  const adminId = await currentAdminId();
  if (!adminId) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().toLowerCase();
  if (q.length < 2) return NextResponse.json({ error: 'q must be at least 2 characters' }, { status: 400 });
  // Spaces are never part of a username, so "brown sugar" still finds brownsugar.
  const needle = `%${q.replace(/[\s%_]/g, '')}%`;

  const found = await db
    .select({ id: users.id, username: users.username, createdAt: users.createdAt })
    .from(users)
    .where(and(ilike(users.usernameLower, needle), eq(users.isBot, false)))
    .limit(20);
  if (found.length === 0) return NextResponse.json({ users: [] });

  const memberships = await db
    .select({ userId: leagueMembers.userId, leagueId: leagueMembers.leagueId })
    .from(leagueMembers)
    .where(
      inArray(
        leagueMembers.userId,
        found.map((u) => u.id),
      ),
    );
  const leagueIds = [...new Set(memberships.map((m) => m.leagueId))];
  const leagueRows = leagueIds.length
    ? await db
        .select({ id: leagues.id, name: leagues.name, isTest: leagues.isTest })
        .from(leagues)
        .where(inArray(leagues.id, leagueIds))
    : [];
  const leagueName = new Map(leagueRows.filter((l) => !l.isTest).map((l) => [l.id, l.name]));

  return NextResponse.json({
    users: found.map((u) => ({
      id: u.id,
      username: u.username,
      createdAt: u.createdAt,
      leagues: memberships
        .filter((m) => m.userId === u.id)
        .map((m) => leagueName.get(m.leagueId))
        .filter((n): n is string => Boolean(n)),
    })),
  });
}

const ResetBody = z.object({
  username: z.string().regex(USERNAME_RE, 'Invalid username'),
  pin: z.string().regex(PIN_RE, 'PIN must be exactly 4 digits'),
});

// POST /api/dev/users { "username": "brownsugar", "pin": "1234" }
// Replaces the account's PIN and clears its login lockout. The admin tells
// the manager the new PIN out of band; nothing is emailed or shown to them.
export async function POST(req: Request) {
  const adminId = await currentAdminId();
  if (!adminId) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const parsed = ResetBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid input' }, { status: 400 });
  }
  const { username, pin } = parsed.data;
  const lower = username.toLowerCase();

  const [user] = await db
    .select({ id: users.id, username: users.username, isBot: users.isBot })
    .from(users)
    .where(eq(users.usernameLower, lower))
    .limit(1);
  if (!user || user.isBot) return NextResponse.json({ error: 'No such user' }, { status: 404 });

  const pinHash = await bcrypt.hash(pin, 10);
  await db.update(users).set({ pinHash }).where(eq(users.id, user.id));
  await clearUserFailures(lower);

  return NextResponse.json({ ok: true, user: { id: user.id, username: user.username } });
}
