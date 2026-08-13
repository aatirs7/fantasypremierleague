import 'server-only';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { gwAwards, messages, users } from './schema';
import { AWARD_LABELS, type AwardKind } from './awards';

// League chat. Managers post smack talk; the app posts the weekly results
// so the feed has something to argue about even in a quiet week.

export async function postMessage(
  leagueId: string,
  userId: string,
  body: string,
): Promise<void> {
  const text = body.trim().slice(0, 500);
  if (!text) return;
  await db.insert(messages).values({ leagueId, userId, body: text });
}

// One digest post per gameweek, carrying that week's awards.
export async function postSystemMessage(leagueId: string, gw: number): Promise<void> {
  const rows = await db
    .select()
    .from(gwAwards)
    .where(eq(gwAwards.leagueId, leagueId));
  const week = rows.filter((r) => r.gw === gw);
  if (!week.length) return;

  const names = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.id, week.map((r) => r.userId)));
  const nameOf = new Map(names.map((n) => [n.id, n.username]));

  const lines = week.map((r) => {
    const label = AWARD_LABELS[r.kind as AwardKind] ?? r.kind;
    return `${label}: ${nameOf.get(r.userId) ?? 'Unknown'}${r.detail ? ` (${r.detail})` : ''}`;
  });
  const body = `Gameweek ${gw} results\n${lines.join('\n')}`;

  // Idempotent: one digest per gameweek, even if finalization re-runs.
  const existing = await db
    .select({ id: messages.id, body: messages.body })
    .from(messages)
    .where(eq(messages.leagueId, leagueId))
    .orderBy(desc(messages.createdAt))
    .limit(40);
  if (existing.some((m) => m.body.startsWith(`Gameweek ${gw} results`))) return;
  await db.insert(messages).values({ leagueId, userId: null, body });
}

export type ChatMessage = {
  id: string;
  username: string | null;
  body: string;
  createdAt: string;
};

export async function recentMessages(leagueId: string, limit = 60): Promise<ChatMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.leagueId, leagueId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  if (!rows.length) return [];
  const ids = [...new Set(rows.map((r) => r.userId).filter(Boolean) as string[])];
  const names = ids.length
    ? await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(inArray(users.id, ids))
    : [];
  const nameOf = new Map(names.map((n) => [n.id, n.username]));
  return rows
    .slice()
    .reverse()
    .map((r) => ({
      id: r.id,
      username: r.userId ? (nameOf.get(r.userId) ?? 'Unknown') : null,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
    }));
}
