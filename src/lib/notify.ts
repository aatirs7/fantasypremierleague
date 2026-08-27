import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { leagues, lineups, squads } from './schema';
import { sendToUsers } from './push';

// Who gets nudged, and what the nudge says. Kept apart from the sync so the
// rules about "has this manager actually done anything" live in one place.

function hoursLeft(deadline: Date): string {
  const mins = Math.max(0, Math.round((deadline.getTime() - Date.now()) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.round(mins / 60);
  return `${h} hour${h === 1 ? '' : 's'}`;
}

// A manager needs nudging when their lineup for this gameweek is still the
// one we generated, or has no captain. Someone who has set their team is
// left alone.
export async function notifyUnsetLineups(gw: number, deadline: Date): Promise<number> {
  const rows = await db
    .select({
      userId: squads.userId,
      squadId: squads.id,
      autoSet: lineups.autoSet,
      picks: lineups.picks,
    })
    .from(squads)
    .innerJoin(leagues, eq(leagues.id, squads.leagueId))
    .leftJoin(lineups, and(eq(lineups.squadId, squads.id), eq(lineups.gw, gw)))
    .where(and(eq(leagues.draftStatus, 'complete'), eq(leagues.isTest, false)));

  const needs = rows
    .filter((r) => !r.picks || r.autoSet || !r.picks.some((p) => p.isCaptain))
    .map((r) => r.userId);
  const unique = [...new Set(needs)];
  if (!unique.length) return 0;

  return sendToUsers(unique, {
    title: `Gameweek ${gw} locks in ${hoursLeft(deadline)}`,
    body: 'Your XI is still the one we picked for you. Set it and pick a captain.',
    url: '/squad',
    tag: `deadline-${gw}`,
  });
}

// Your result, once the gameweek settles.
export async function notifyGwResult(
  userId: string,
  gw: number,
  points: number,
  outcome: string,
): Promise<number> {
  return sendToUsers([userId], {
    title: `Gameweek ${gw}: ${points} points`,
    body: outcome,
    url: '/league',
    tag: `result-${gw}`,
  });
}
