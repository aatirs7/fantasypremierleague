import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fplPlayers } from '@/lib/schema';
import { currentUserId } from '@/lib/auth';

// The full player pool with draft-room-card fields, fetched once when the
// room opens (~60KB). The client filters by search/position and removes
// taken ids from the polled state, so drafted players vanish instantly.
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  const players = await db
    .select({
      fplId: fplPlayers.fplId,
      photoCode: fplPlayers.photoCode,
      webName: fplPlayers.webName,
      clubShort: fplPlayers.clubShort,
      position: fplPlayers.position,
      price: fplPlayers.price,
      draftRank: fplPlayers.draftRank,
      totalPoints: fplPlayers.totalPoints,
      form: fplPlayers.form,
      status: fplPlayers.status,
      setPieceNotes: fplPlayers.setPieceNotes,
    })
    .from(fplPlayers)
    .orderBy(sql`${fplPlayers.draftRank} asc nulls last`, sql`${fplPlayers.totalPoints} desc`);
  return NextResponse.json({ players });
}
