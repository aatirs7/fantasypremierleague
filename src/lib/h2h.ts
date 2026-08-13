import 'server-only';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { h2hRecords, matchups, gwScores, leagueMembers, squads, users } from './schema';
import {
  FINAL_GW,
  REGULAR_SEASON_END,
  SEMIS_GW,
  buildFinals,
  buildRegularSeason,
  buildSemis,
  sortRecords,
  type H2HRecord,
} from './h2h-rules';

// Head-to-head lifecycle:
//   1. schedule generated once, when a league finishes its draft
//   2. each finalized gameweek settles that week's fixtures and rolls records
//   3. after the regular season ends, semis then the final are seeded
// Every step is idempotent, in keeping with the rest of the sync.

export async function ensureSchedule(leagueId: string): Promise<void> {
  const [existing] = await db
    .select({ gw: matchups.gw })
    .from(matchups)
    .where(eq(matchups.leagueId, leagueId))
    .limit(1);
  if (existing) return;

  const members = await db
    .select({ userId: leagueMembers.userId, draftOrder: leagueMembers.draftOrder })
    .from(leagueMembers)
    .where(eq(leagueMembers.leagueId, leagueId));
  const ordered = members
    .slice()
    .sort((a, b) => (a.draftOrder ?? 99) - (b.draftOrder ?? 99))
    .map((m) => m.userId);
  const season = buildRegularSeason(ordered);
  if (!season.length) return;

  await db.insert(matchups).values(
    season.map((m) => ({
      leagueId,
      gw: m.gw,
      slot: m.slot,
      homeUserId: m.homeUserId,
      awayUserId: m.awayUserId,
      round: m.round,
    })),
  );
  await db
    .insert(h2hRecords)
    .values(ordered.map((userId) => ({ leagueId, userId })))
    .onConflictDoNothing();
}

async function pointsByUser(leagueId: string, gw: number): Promise<Map<string, number>> {
  const rows = await db
    .select({ userId: squads.userId, points: gwScores.totalPoints })
    .from(squads)
    .innerJoin(gwScores, eq(gwScores.squadId, squads.id))
    .where(and(eq(squads.leagueId, leagueId), eq(gwScores.gw, gw)));
  return new Map(rows.map((r) => [r.userId, r.points]));
}

// Recompute every record from settled fixtures, so a re-run converges.
async function rollupRecords(leagueId: string): Promise<void> {
  const settled = await db
    .select()
    .from(matchups)
    .where(and(eq(matchups.leagueId, leagueId), eq(matchups.settled, true)));
  const members = await db
    .select({ userId: leagueMembers.userId })
    .from(leagueMembers)
    .where(eq(leagueMembers.leagueId, leagueId));

  const acc = new Map<string, H2HRecord>();
  for (const m of members) {
    acc.set(m.userId, {
      userId: m.userId,
      wins: 0,
      losses: 0,
      draws: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    });
  }
  for (const m of settled) {
    if (m.round !== 'regular') continue; // playoffs do not move the table
    const home = acc.get(m.homeUserId);
    if (!home) continue;
    const hp = m.homePoints ?? 0;
    if (!m.awayUserId) {
      // A bye counts as neither a win nor a loss, but the points still count.
      home.pointsFor += hp;
      continue;
    }
    const away = acc.get(m.awayUserId);
    if (!away) continue;
    const ap = m.awayPoints ?? 0;
    home.pointsFor += hp;
    home.pointsAgainst += ap;
    away.pointsFor += ap;
    away.pointsAgainst += hp;
    if (hp > ap) {
      home.wins++;
      away.losses++;
    } else if (hp < ap) {
      away.wins++;
      home.losses++;
    } else {
      home.draws++;
      away.draws++;
    }
  }

  for (const rec of acc.values()) {
    await db
      .insert(h2hRecords)
      .values({ leagueId, ...rec })
      .onConflictDoUpdate({
        target: [h2hRecords.leagueId, h2hRecords.userId],
        set: {
          wins: rec.wins,
          losses: rec.losses,
          draws: rec.draws,
          pointsFor: rec.pointsFor,
          pointsAgainst: rec.pointsAgainst,
        },
      });
  }
}

// Settle one gameweek's fixtures from the final scores, then seed whatever
// playoff round the calendar now calls for.
export async function settleGw(leagueId: string, gw: number, notes: string[]): Promise<void> {
  await ensureSchedule(leagueId);
  const points = await pointsByUser(leagueId, gw);
  const week = await db
    .select()
    .from(matchups)
    .where(and(eq(matchups.leagueId, leagueId), eq(matchups.gw, gw)));

  for (const m of week) {
    const hp = points.get(m.homeUserId) ?? 0;
    const ap = m.awayUserId ? (points.get(m.awayUserId) ?? 0) : null;
    await db
      .update(matchups)
      .set({ homePoints: hp, awayPoints: ap, settled: true })
      .where(
        and(
          eq(matchups.leagueId, leagueId),
          eq(matchups.gw, m.gw),
          eq(matchups.slot, m.slot),
        ),
      );
  }
  await rollupRecords(leagueId);
  if (week.length) notes.push(`h2h: settled ${week.length} fixtures for gw${gw}`);

  if (gw === REGULAR_SEASON_END) await seedSemis(leagueId, notes);
  if (gw === SEMIS_GW) await seedFinals(leagueId, notes);
}

async function seedSemis(leagueId: string, notes: string[]): Promise<void> {
  const [existing] = await db
    .select({ slot: matchups.slot })
    .from(matchups)
    .where(and(eq(matchups.leagueId, leagueId), eq(matchups.gw, SEMIS_GW)))
    .limit(1);
  if (existing) return;
  const records = await db.select().from(h2hRecords).where(eq(h2hRecords.leagueId, leagueId));
  const seeds = sortRecords(records).map((r) => r.userId);
  const semis = buildSemis(seeds);
  if (!semis.length) return;
  await db.insert(matchups).values(
    semis.map((m) => ({
      leagueId,
      gw: m.gw,
      slot: m.slot,
      homeUserId: m.homeUserId,
      awayUserId: m.awayUserId,
      round: m.round,
    })),
  );
  notes.push(`h2h: seeded ${semis.length} semi-finals`);
}

async function seedFinals(leagueId: string, notes: string[]): Promise<void> {
  const [existing] = await db
    .select({ slot: matchups.slot })
    .from(matchups)
    .where(and(eq(matchups.leagueId, leagueId), eq(matchups.gw, FINAL_GW)))
    .limit(1);
  if (existing) return;
  const semis = await db
    .select()
    .from(matchups)
    .where(and(eq(matchups.leagueId, leagueId), eq(matchups.gw, SEMIS_GW)))
    .orderBy(asc(matchups.slot));
  const winners: string[] = [];
  const losers: string[] = [];
  for (const m of semis) {
    if (!m.awayUserId) {
      winners.push(m.homeUserId);
      continue;
    }
    const homeWon = (m.homePoints ?? 0) >= (m.awayPoints ?? 0);
    winners.push(homeWon ? m.homeUserId : m.awayUserId);
    losers.push(homeWon ? m.awayUserId : m.homeUserId);
  }
  const finals = buildFinals(winners, losers);
  if (!finals.length) return;
  await db.insert(matchups).values(
    finals.map((m) => ({
      leagueId,
      gw: m.gw,
      slot: m.slot,
      homeUserId: m.homeUserId,
      awayUserId: m.awayUserId,
      round: m.round,
    })),
  );
  notes.push('h2h: seeded the final');
}

export type StandingRow = H2HRecord & { rank: number; username: string };

export async function h2hStandings(leagueId: string): Promise<StandingRow[]> {
  const records = await db.select().from(h2hRecords).where(eq(h2hRecords.leagueId, leagueId));
  if (!records.length) return [];
  const names = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.id, records.map((r) => r.userId)));
  const nameOf = new Map(names.map((n) => [n.id, n.username]));
  return sortRecords(records).map((r, i) => ({
    ...r,
    rank: i + 1,
    username: nameOf.get(r.userId) ?? 'Unknown',
  }));
}

// This week's fixtures with names and live points, for the league page.
export async function weekFixtures(leagueId: string, gw: number) {
  const rows = await db
    .select()
    .from(matchups)
    .where(and(eq(matchups.leagueId, leagueId), eq(matchups.gw, gw)))
    .orderBy(asc(matchups.slot));
  if (!rows.length) return [];
  const ids = [
    ...new Set(rows.flatMap((r) => [r.homeUserId, r.awayUserId]).filter(Boolean) as string[]),
  ];
  const names = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.id, ids));
  const nameOf = new Map(names.map((n) => [n.id, n.username]));
  const live = await pointsByUser(leagueId, gw);
  return rows.map((r) => ({
    slot: r.slot,
    round: r.round,
    settled: r.settled,
    home: {
      userId: r.homeUserId,
      username: nameOf.get(r.homeUserId) ?? '?',
      points: r.settled ? (r.homePoints ?? 0) : (live.get(r.homeUserId) ?? 0),
    },
    away: r.awayUserId
      ? {
          userId: r.awayUserId,
          username: nameOf.get(r.awayUserId) ?? '?',
          points: r.settled ? (r.awayPoints ?? 0) : (live.get(r.awayUserId) ?? 0),
        }
      : null,
  }));
}
