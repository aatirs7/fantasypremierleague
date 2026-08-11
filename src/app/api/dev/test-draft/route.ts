import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { and, eq, inArray } from 'drizzle-orm';
import { db, withTransaction } from '@/lib/db';
import {
  draftPicks,
  gwScores,
  leagueMembers,
  leagues,
  lineups,
  seasonScores,
  squadPlayers,
  squads,
  standingSnapshots,
  trades,
  users,
  waiverClaims,
  waiverLocks,
  waiverPriority,
} from '@/lib/schema';
import { currentAdminId } from '@/lib/admin';
import { generateJoinCode } from '@/lib/leagues';

// Dev-only: spin up a full test draft the admin can rehearse alone. Creates
// an is_test league, N-1 bot users, schedules the draft for now, returns the
// league id. Bots pick via the real lazy-deadline auto-pick machinery, so
// the dry run exercises the REAL pick transaction and polling.

const ADJECTIVES = ['swift', 'calm', 'bold', 'lucky', 'sly', 'keen', 'wild', 'brave', 'quiet', 'rapid'];
const ANIMALS = ['falcon', 'otter', 'lynx', 'heron', 'badger', 'viper', 'stoat', 'raven', 'ibex', 'wolf'];

const Body = z.object({
  managers: z.number().int().min(4).max(30).default(8),
  bot_speed_ms: z.number().int().min(500).max(60_000).default(4000),
  bot_variance: z.boolean().default(false),
});

export async function POST(req: Request) {
  const adminId = await currentAdminId();
  if (!adminId) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const parsed = Body.safeParse((await req.json().catch(() => null)) ?? {});
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  const { managers, bot_speed_ms, bot_variance } = parsed.data;

  const stamp = new Date().toISOString().replace('T', ' ').slice(5, 16);
  const [league] = await db
    .insert(leagues)
    .values({
      name: `TEST DRAFT ${stamp}`,
      joinCode: generateJoinCode(),
      ownerId: adminId,
      isTest: true,
      draftTime: new Date(),
      botSpeedMs: bot_speed_ms,
      botVariance: bot_variance,
    })
    .returning();

  await db.insert(leagueMembers).values({ leagueId: league.id, userId: adminId });

  // Bots are never shared between test leagues, so deletion stays safe.
  const pinHash = await bcrypt.hash('0000', 4);
  const suffix = league.id.slice(0, 4);
  for (let i = 0; i < managers - 1; i++) {
    const name = `bot_${ADJECTIVES[i % 10]}_${ANIMALS[(i * 3 + 1) % 10]}_${suffix}${i}`;
    const [bot] = await db
      .insert(users)
      .values({ username: name, usernameLower: name.toLowerCase(), pinHash, isBot: true })
      .returning();
    await db.insert(leagueMembers).values({ leagueId: league.id, userId: bot.id });
  }

  return NextResponse.json({ leagueId: league.id });
}

// Hard-delete a test league: squads, picks, lineups, scores, waivers,
// trades, memberships, bot users, the league. One transaction, no orphans.
export async function DELETE(req: Request) {
  const adminId = await currentAdminId();
  if (!adminId) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const leagueId = new URL(req.url).searchParams.get('leagueId');
  if (!leagueId) return NextResponse.json({ error: 'leagueId required' }, { status: 400 });

  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId)).limit(1);
  if (!league) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!league.isTest) return NextResponse.json({ error: 'not a test league' }, { status: 400 });

  await withTransaction(async (tx) => {
    const squadRows = await tx
      .select({ id: squads.id })
      .from(squads)
      .where(eq(squads.leagueId, leagueId));
    const squadIds = squadRows.map((s) => s.id);
    const memberRows = await tx
      .select({ userId: leagueMembers.userId })
      .from(leagueMembers)
      .where(eq(leagueMembers.leagueId, leagueId));
    const memberIds = memberRows.map((m) => m.userId);

    if (squadIds.length) {
      await tx.delete(lineups).where(inArray(lineups.squadId, squadIds));
      await tx.delete(gwScores).where(inArray(gwScores.squadId, squadIds));
      await tx.delete(seasonScores).where(inArray(seasonScores.squadId, squadIds));
    }
    await tx.delete(squadPlayers).where(eq(squadPlayers.leagueId, leagueId));
    await tx.delete(draftPicks).where(eq(draftPicks.leagueId, leagueId));
    await tx.delete(squads).where(eq(squads.leagueId, leagueId));
    await tx.delete(waiverClaims).where(eq(waiverClaims.leagueId, leagueId));
    await tx.delete(waiverPriority).where(eq(waiverPriority.leagueId, leagueId));
    await tx.delete(waiverLocks).where(eq(waiverLocks.leagueId, leagueId));
    await tx.delete(trades).where(eq(trades.leagueId, leagueId));
    await tx.delete(standingSnapshots).where(eq(standingSnapshots.leagueId, leagueId));
    await tx.delete(leagueMembers).where(eq(leagueMembers.leagueId, leagueId));
    await tx.delete(leagues).where(eq(leagues.id, leagueId));
    // Bot users belong only to this league.
    if (memberIds.length) {
      await tx.delete(users).where(and(inArray(users.id, memberIds), eq(users.isBot, true)));
    }
  });

  return NextResponse.json({ ok: true });
}
