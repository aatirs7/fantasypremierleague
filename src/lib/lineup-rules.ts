// Pure lineup rules: no DB, no server-only, fully unit-testable.
import type { LineupPick } from './schema';

export type SquadPlayerInfo = {
  fplId: number;
  position: string; // GK DEF MID FWD
  form: number; // parsed numeric form, 0 when unknown
};

// Valid XI: 1 GK, 3-5 DEF, 2-5 MID, 1-3 FWD, exactly 11 starting.
export const XI_MIN: Record<string, number> = { GK: 1, DEF: 3, MID: 2, FWD: 1 };
export const XI_MAX: Record<string, number> = { GK: 1, DEF: 5, MID: 5, FWD: 3 };

export function validateLineup(
  picks: LineupPick[],
  positionOf: Map<number, string>,
  squadIds: Set<number>,
): string | null {
  if (picks.length !== 15) return 'Lineup must cover all 15 players';
  const ids = new Set(picks.map((p) => p.fplId));
  if (ids.size !== 15) return 'Duplicate player in lineup';
  for (const p of picks) {
    if (!squadIds.has(p.fplId)) return 'Lineup contains a player not on this squad';
  }
  const starters = picks.filter((p) => p.starting);
  if (starters.length !== 11) return 'Exactly 11 players must start';
  const counts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of starters) {
    const pos = positionOf.get(p.fplId);
    if (!pos) return 'Unknown player position';
    counts[pos]++;
  }
  for (const pos of Object.keys(XI_MIN)) {
    if (counts[pos] < XI_MIN[pos]) return `You need at least ${XI_MIN[pos]} ${pos} starting`;
    if (counts[pos] > XI_MAX[pos]) return `At most ${XI_MAX[pos]} ${pos} can start`;
  }
  const captains = starters.filter((p) => p.isCaptain);
  const vices = starters.filter((p) => p.isVice);
  if (captains.length !== 1) return 'Pick exactly one captain (must be starting)';
  if (vices.length !== 1) return 'Pick exactly one vice captain (must be starting)';
  if (captains[0].fplId === vices[0].fplId) return 'Captain and vice must be different players';
  const bench = picks.filter((p) => !p.starting);
  const benchSlots = bench.map((p) => p.slot).sort((a, b) => a - b);
  if (benchSlots.length !== 4 || benchSlots.some((s, i) => s !== 12 + i)) {
    return 'Bench must fill slots 12-15';
  }
  const starterSlots = starters.map((p) => p.slot).sort((a, b) => a - b);
  if (starterSlots.some((s, i) => s !== 1 + i)) return 'Starters must fill slots 1-11';
  if (picks.some((p) => !p.starting && (p.isCaptain || p.isVice))) {
    return 'Captain and vice must be starting';
  }
  return null;
}

// Deterministic auto lineup: highest-form valid XI, captain = top form
// starter, vice = second, bench ordered by form. Same input, same output.
export function generateAutoLineup(squad: SquadPlayerInfo[]): LineupPick[] {
  // Stable sort: form desc, then fplId asc so ties are deterministic.
  const sorted = squad
    .slice()
    .sort((a, b) => b.form - a.form || a.fplId - b.fplId);

  const starters: SquadPlayerInfo[] = [];
  const counts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };

  // First pass: satisfy minimums with the best available at each position.
  for (const pos of Object.keys(XI_MIN)) {
    for (const p of sorted) {
      if (counts[pos] >= XI_MIN[pos]) break;
      if (p.position === pos && !starters.includes(p)) {
        starters.push(p);
        counts[pos]++;
      }
    }
  }
  // Second pass: fill to 11 by form, respecting maximums.
  for (const p of sorted) {
    if (starters.length >= 11) break;
    if (starters.includes(p)) continue;
    if (counts[p.position] >= XI_MAX[p.position]) continue;
    starters.push(p);
    counts[p.position]++;
  }

  const starterSet = new Set(starters.map((s) => s.fplId));
  const bench = sorted.filter((p) => !starterSet.has(p.fplId));
  // Order the XI for stable slots: GK first, then DEF, MID, FWD by form.
  const posOrder: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
  const orderedXi = starters
    .slice()
    .sort((a, b) => posOrder[a.position] - posOrder[b.position] || b.form - a.form || a.fplId - b.fplId);

  const byForm = starters.slice().sort((a, b) => b.form - a.form || a.fplId - b.fplId);
  const captainId = byForm[0]?.fplId;
  const viceId = byForm[1]?.fplId;

  return [
    ...orderedXi.map((p, i) => ({
      fplId: p.fplId,
      slot: i + 1,
      starting: true,
      isCaptain: p.fplId === captainId,
      isVice: p.fplId === viceId,
    })),
    ...bench.map((p, i) => ({
      fplId: p.fplId,
      slot: 12 + i,
      starting: false,
      isCaptain: false,
      isVice: false,
    })),
  ];
}
