import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db } from './db';
import { leagueMembers, leagues, users } from './schema';

export const MIN_MANAGERS = 4;

// Unambiguous join-code alphabet: no 0/O/1/I/L.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateJoinCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export async function isLeagueMember(userId: string, leagueId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: leagueMembers.userId })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)))
    .limit(1);
  return !!row;
}

export type LeagueMemberInfo = {
  userId: string;
  username: string;
  isBot: boolean;
  draftOrder: number | null;
  lastSeenAt: Date | null;
};

export async function leagueMemberList(leagueId: string): Promise<LeagueMemberInfo[]> {
  const rows = await db
    .select({
      userId: leagueMembers.userId,
      draftOrder: leagueMembers.draftOrder,
      lastSeenAt: leagueMembers.lastSeenAt,
    })
    .from(leagueMembers)
    .where(eq(leagueMembers.leagueId, leagueId));
  if (rows.length === 0) return [];
  const userRows = await db
    .select({ id: users.id, username: users.username, isBot: users.isBot })
    .from(users)
    .where(inArray(users.id, rows.map((r) => r.userId)));
  const byId = new Map(userRows.map((u) => [u.id, u]));
  return rows
    .map((r) => ({
      userId: r.userId,
      username: byId.get(r.userId)?.username ?? 'Unknown',
      isBot: byId.get(r.userId)?.isBot ?? false,
      draftOrder: r.draftOrder,
      lastSeenAt: r.lastSeenAt,
    }))
    .sort((a, b) => a.username.localeCompare(b.username));
}

export async function myLeagues(userId: string) {
  const memberships = await db
    .select({ leagueId: leagueMembers.leagueId })
    .from(leagueMembers)
    .where(eq(leagueMembers.userId, userId));
  if (memberships.length === 0) return [];
  return db
    .select()
    .from(leagues)
    .where(inArray(leagues.id, memberships.map((m) => m.leagueId)));
}

const ACTIVE_LEAGUE_COOKIE = 'epld_active_league';

// Active league resolution, same order as wc26: ?league= param, cookie,
// first membership.
export async function resolveActiveLeagueId(
  userId: string,
  explicit?: string | null,
): Promise<string | null> {
  const mine = await db
    .select({ leagueId: leagueMembers.leagueId })
    .from(leagueMembers)
    .where(eq(leagueMembers.userId, userId));
  const ids = new Set(mine.map((m) => m.leagueId));
  if (explicit && ids.has(explicit)) return explicit;
  const jar = await cookies();
  const fromCookie = jar.get(ACTIVE_LEAGUE_COOKIE)?.value;
  if (fromCookie && ids.has(fromCookie)) return fromCookie;
  return mine[0]?.leagueId ?? null;
}
