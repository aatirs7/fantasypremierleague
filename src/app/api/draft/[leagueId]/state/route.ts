import { NextResponse } from 'next/server';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  draftPicks,
  fplPlayers,
  leagueMembers,
  leagues,
  squadPlayers,
  squads,
  users,
} from '@/lib/schema';
import { currentUserId } from '@/lib/auth';
import { enforceDeadlines, pickerIndex, roundOf, SQUAD_SIZE } from '@/lib/draft';

// Polled every 2s by everyone in the draft room. The response is the single
// source of truth: clients render purely from this payload so every device
// shows identical state. Also the engine of lazy deadline enforcement and
// the lobby presence heartbeat.
export async function GET(req: Request, ctx: { params: Promise<{ leagueId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  const { leagueId } = await ctx.params;

  const [membership] = await db
    .select({ userId: leagueMembers.userId })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)))
    .limit(1);
  if (!membership) return NextResponse.json({ error: 'not a member' }, { status: 403 });

  // Execute any overdue auto-picks first. Cheap read gate before the
  // WebSocket transaction so quiet polls never open one.
  const [gate] = await db
    .select({ draftStatus: leagues.draftStatus, deadline: leagues.currentPickDeadline })
    .from(leagues)
    .where(eq(leagues.id, leagueId))
    .limit(1);
  if (
    gate?.draftStatus === 'active' &&
    gate.deadline != null &&
    gate.deadline.getTime() <= Date.now()
  ) {
    try {
      await enforceDeadlines(leagueId);
    } catch {
      // A concurrent poll may have taken the lock and done the work; the
      // read below still returns fresh truth.
    }
  }

  // Heartbeat for lobby presence.
  await db
    .update(leagueMembers)
    .set({ lastSeenAt: new Date() })
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));

  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId)).limit(1);
  if (!league) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const memberRows = await db
    .select({
      userId: leagueMembers.userId,
      draftOrder: leagueMembers.draftOrder,
      lastSeenAt: leagueMembers.lastSeenAt,
      username: users.username,
      isBot: users.isBot,
    })
    .from(leagueMembers)
    .innerJoin(users, eq(users.id, leagueMembers.userId))
    .where(eq(leagueMembers.leagueId, leagueId));

  const ordered = memberRows
    .filter((m) => m.draftOrder != null)
    .sort((a, b) => a.draftOrder! - b.draftOrder!);
  const managers = ordered.length || memberRows.length;
  const totalPicks = managers * SQUAD_SIZE;

  const pickRows = await db
    .select({
      pickNumber: draftPicks.pickNumber,
      round: draftPicks.round,
      userId: draftPicks.userId,
      fplId: draftPicks.fplId,
      autoPicked: draftPicks.autoPicked,
    })
    .from(draftPicks)
    .where(eq(draftPicks.leagueId, leagueId))
    .orderBy(desc(draftPicks.pickNumber))
    .limit(20);

  const squadRows = await db
    .select({ squadId: squads.id, userId: squads.userId })
    .from(squads)
    .where(eq(squads.leagueId, leagueId));
  const squadOwner = new Map(squadRows.map((s) => [s.squadId, s.userId]));

  const ownedRows = await db
    .select({ squadId: squadPlayers.squadId, fplId: squadPlayers.fplId })
    .from(squadPlayers)
    .where(and(eq(squadPlayers.leagueId, leagueId), isNull(squadPlayers.droppedGw)));

  const involvedIds = [
    ...new Set([...ownedRows.map((o) => o.fplId), ...pickRows.map((p) => p.fplId)]),
  ];
  const playerRows = involvedIds.length
    ? await db
        .select({
          fplId: fplPlayers.fplId,
          webName: fplPlayers.webName,
          position: fplPlayers.position,
          clubShort: fplPlayers.clubShort,
        })
        .from(fplPlayers)
        .where(inArray(fplPlayers.fplId, involvedIds))
    : [];
  const playerById = new Map(playerRows.map((p) => [p.fplId, p]));
  const nameById = new Map(memberRows.map((m) => [m.userId, m.username]));

  const squadsByUser: Record<
    string,
    { fplId: number; webName: string; position: string; clubShort: string }[]
  > = {};
  for (const m of memberRows) squadsByUser[m.userId] = [];
  for (const o of ownedRows) {
    const uid = squadOwner.get(o.squadId);
    const p = playerById.get(o.fplId);
    if (uid && p && squadsByUser[uid]) squadsByUser[uid].push(p);
  }

  const currentIdx =
    league.draftStatus === 'active' && league.currentPick != null && managers > 0
      ? pickerIndex(league.currentPick, managers)
      : null;
  const currentPicker = currentIdx != null ? ordered[currentIdx] : null;
  const nextNames: string[] = [];
  if (league.draftStatus === 'active' && league.currentPick != null) {
    for (let n = 1; n <= 2; n++) {
      const p = league.currentPick + n;
      if (p > totalPicks) break;
      nextNames.push(ordered[pickerIndex(p, managers)]?.username ?? '?');
    }
  }

  const now = Date.now();
  const present = memberRows
    .filter((m) => m.isBot || (m.lastSeenAt && now - m.lastSeenAt.getTime() < 10_000))
    .map((m) => m.userId);

  return NextResponse.json({
    stateVersion: league.stateVersion,
    draftStatus: league.draftStatus,
    isTest: league.isTest,
    draftTime: league.draftTime?.toISOString() ?? null,
    ownerId: league.ownerId,
    currentPick: league.currentPick,
    round: league.currentPick != null ? roundOf(league.currentPick, managers) : null,
    totalPicks,
    managers,
    deadline: league.currentPickDeadline?.toISOString() ?? null,
    serverNow: new Date(now).toISOString(),
    currentPicker: currentPicker
      ? { userId: currentPicker.userId, username: currentPicker.username, isBot: currentPicker.isBot }
      : null,
    nextUp: nextNames,
    picks: pickRows.map((p) => ({
      pickNumber: p.pickNumber,
      round: p.round,
      userId: p.userId,
      username: nameById.get(p.userId) ?? '?',
      autoPicked: p.autoPicked,
      player: playerById.get(p.fplId) ?? null,
    })),
    members: memberRows
      .slice()
      .sort((a, b) => (a.draftOrder ?? 99) - (b.draftOrder ?? 99))
      .map((m) => ({
        userId: m.userId,
        username: m.username,
        isBot: m.isBot,
        draftOrder: m.draftOrder,
        present: present.includes(m.userId),
      })),
    squads: squadsByUser,
    takenIds: ownedRows.map((o) => o.fplId),
  });
}
