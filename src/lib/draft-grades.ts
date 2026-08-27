import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from './db';
import { draftPicks, fplPlayers, leagueMembers, squadPlayers, squads, users } from './schema';
import { draftAwards, gradeDraft, type Award, type Grade, type GradeEntry } from './draft-grade';

// Server side of the grader: assemble every manager's board and hand it to
// the pure function. Recomputed on read rather than stored, because it is
// cheap and because a player's status changes under it (an injury after the
// draft should show up in the reasons).
async function buildEntries(leagueId: string): Promise<GradeEntry[]> {
  const members = await db
    .select({ userId: leagueMembers.userId, username: users.username, isBot: users.isBot })
    .from(leagueMembers)
    .innerJoin(users, eq(users.id, leagueMembers.userId))
    .where(eq(leagueMembers.leagueId, leagueId));
  if (members.length < 2) return [];

  const picks = await db
    .select({
      userId: draftPicks.userId,
      fplId: draftPicks.fplId,
      pickNumber: draftPicks.pickNumber,
      autoPicked: draftPicks.autoPicked,
    })
    .from(draftPicks)
    .where(eq(draftPicks.leagueId, leagueId));
  if (!picks.length) return [];

  const info = await db
    .select({
      fplId: fplPlayers.fplId,
      webName: fplPlayers.webName,
      position: fplPlayers.position,
      clubShort: fplPlayers.clubShort,
      draftRank: fplPlayers.draftRank,
      lastSeasonPoints: fplPlayers.lastSeasonPoints,
      status: fplPlayers.status,
    })
    .from(fplPlayers);
  const infoOf = new Map(info.map((p) => [p.fplId, p]));

  const entries: GradeEntry[] = members.map((m) => ({
    userId: m.userId,
    username: m.username,
    players: picks
      .filter((p) => p.userId === m.userId)
      .map((p) => {
        const i = infoOf.get(p.fplId);
        return {
          fplId: p.fplId,
          webName: i?.webName ?? `#${p.fplId}`,
          position: i?.position ?? 'MID',
          clubShort: i?.clubShort ?? '',
          draftRank: i?.draftRank ?? null,
          lastSeasonPoints: i?.lastSeasonPoints ?? null,
          status: i?.status ?? 'a',
          pickNumber: p.pickNumber,
          autoPicked: p.autoPicked,
        };
      }),
  }));

  return entries.filter((e) => e.players.length > 0);
}

export async function leagueDraftGrades(leagueId: string): Promise<Grade[]> {
  return gradeDraft(await buildEntries(leagueId));
}

export async function leagueDraftAwards(leagueId: string): Promise<Award[]> {
  return draftAwards(await buildEntries(leagueId));
}

// How many picks the board actually took, for the report's opening line.
export async function leaguePickCount(leagueId: string): Promise<number> {
  const entries = await buildEntries(leagueId);
  return entries.reduce((n, e) => n + e.players.length, 0);
}

// Kept for the squad view: who owns whom, without a second round trip.
export async function ownersInLeague(leagueId: string): Promise<Map<number, string>> {
  const rows = await db
    .select({ fplId: squadPlayers.fplId, username: users.username })
    .from(squadPlayers)
    .innerJoin(squads, eq(squads.id, squadPlayers.squadId))
    .innerJoin(users, eq(users.id, squads.userId))
    .where(and(eq(squadPlayers.leagueId, leagueId), isNull(squadPlayers.droppedGw)));
  return new Map(rows.map((r) => [r.fplId, r.username]));
}
