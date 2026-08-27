import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { leagueMembers, squads, users } from './schema';

// What to call a manager anywhere in a league. Once someone names their team
// that name is their identity: the table, the fixtures, the trade history and
// the draft grades all use it, and their username stops appearing.
export async function teamNames(leagueId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ userId: leagueMembers.userId, username: users.username, squadName: squads.name })
    .from(leagueMembers)
    .innerJoin(users, eq(users.id, leagueMembers.userId))
    .leftJoin(squads, eq(squads.userId, leagueMembers.userId))
    .where(eq(leagueMembers.leagueId, leagueId));
  // A user can hold squads in several leagues; the join above is filtered by
  // membership, so take the first non-empty name we see for each manager.
  const out = new Map<string, string>();
  for (const r of rows) {
    if (!out.has(r.userId) || (r.squadName && out.get(r.userId) === r.username)) {
      out.set(r.userId, r.squadName ?? r.username);
    }
  }
  return out;
}
