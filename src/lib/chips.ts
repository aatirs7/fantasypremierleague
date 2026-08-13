import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { chips } from './schema';

// One use of each chip per manager per season, declared before a deadline
// and locked in for that gameweek.
//   triple_captain: the captain scores 3x instead of 2x
//   bench_boost:    all 15 players count, no autosubs
//   wildcard:       unlimited waiver claims can be approved that window

export const CHIP_KINDS = ['triple_captain', 'bench_boost', 'wildcard'] as const;
export type ChipKind = (typeof CHIP_KINDS)[number];

export const CHIP_META: Record<ChipKind, { label: string; blurb: string }> = {
  triple_captain: {
    label: 'Triple Captain',
    blurb: 'Your captain scores triple instead of double for one gameweek.',
  },
  bench_boost: {
    label: 'Bench Boost',
    blurb: 'All 15 of your players score. Nobody is left on the bench.',
  },
  wildcard: {
    label: 'Wildcard',
    blurb: 'Every one of your waiver claims can land in a single window.',
  },
};

export class ChipError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

export async function chipsForUser(leagueId: string, userId: string) {
  return db
    .select()
    .from(chips)
    .where(and(eq(chips.leagueId, leagueId), eq(chips.userId, userId)));
}

// The chip a manager has active for a given gameweek, if any.
export async function activeChip(
  leagueId: string,
  userId: string,
  gw: number,
): Promise<ChipKind | null> {
  const [row] = await db
    .select({ chip: chips.chip })
    .from(chips)
    .where(and(eq(chips.leagueId, leagueId), eq(chips.userId, userId), eq(chips.gw, gw)))
    .limit(1);
  return (row?.chip as ChipKind) ?? null;
}

// Every squad's active chip for a gameweek, keyed by squad id. Used by the
// scoring pass so it does not query per squad.
export async function activeChipsBySquad(gw: number): Promise<Map<string, ChipKind>> {
  const { squads } = await import('./schema');
  const rows = await db
    .select({ squadId: squads.id, chip: chips.chip })
    .from(chips)
    .innerJoin(
      squads,
      and(eq(squads.leagueId, chips.leagueId), eq(squads.userId, chips.userId)),
    )
    .where(eq(chips.gw, gw));
  return new Map(rows.map((r) => [r.squadId, r.chip as ChipKind]));
}

export async function playChip(
  leagueId: string,
  userId: string,
  chip: ChipKind,
  gw: number,
): Promise<void> {
  const mine = await chipsForUser(leagueId, userId);
  if (mine.some((c) => c.chip === chip)) {
    throw new ChipError('You have already used that chip this season');
  }
  if (mine.some((c) => c.gw === gw)) {
    throw new ChipError('You can only play one chip per gameweek');
  }
  await db.insert(chips).values({ leagueId, userId, chip, gw });
}

export async function cancelChip(
  leagueId: string,
  userId: string,
  chip: ChipKind,
  gw: number,
): Promise<void> {
  const [row] = await db
    .select()
    .from(chips)
    .where(and(eq(chips.leagueId, leagueId), eq(chips.userId, userId), eq(chips.chip, chip)))
    .limit(1);
  if (!row) throw new ChipError('That chip is not in play', 404);
  if (row.gw !== gw) throw new ChipError('That chip is locked to a past gameweek');
  await db
    .delete(chips)
    .where(and(eq(chips.leagueId, leagueId), eq(chips.userId, userId), eq(chips.chip, chip)));
}
