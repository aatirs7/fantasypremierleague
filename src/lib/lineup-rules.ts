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
const POSITIONS_XI = ['GK', 'DEF', 'MID', 'FWD'];

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

// Every legal shape, as (DEF, MID, FWD). One keeper is fixed, so the
// outfield ten are what vary.
export function legalFormations(): { def: number; mid: number; fwd: number; label: string }[] {
  const out: { def: number; mid: number; fwd: number; label: string }[] = [];
  for (let def = XI_MIN.DEF; def <= XI_MAX.DEF; def++) {
    for (let mid = XI_MIN.MID; mid <= XI_MAX.MID; mid++) {
      const fwd = 10 - def - mid;
      if (fwd < XI_MIN.FWD || fwd > XI_MAX.FWD) continue;
      out.push({ def, mid, fwd, label: `${def}-${mid}-${fwd}` });
    }
  }
  return out;
}

// Rearrange a squad into a target shape, keeping as many of the current
// starters as possible: the ones dropped are the weakest at their position,
// and the ones promoted are the strongest on the bench. Anything that leaves
// the XI loses its armband, because a captain on the bench scores nothing.
export function applyFormation(
  picks: { fplId: number; starting: boolean; slot: number; isCaptain: boolean; isVice: boolean }[],
  positionOf: Map<number, string>,
  strengthOf: (fplId: number) => number,
  target: { def: number; mid: number; fwd: number },
): typeof picks {
  const want: Record<string, number> = { GK: 1, DEF: target.def, MID: target.mid, FWD: target.fwd };
  const startingIds = new Set<number>();

  for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
    const candidates = picks
      .filter((p) => positionOf.get(p.fplId) === pos)
      .sort((a, b) => {
        // Current starters first, so a formation change is the smallest
        // edit that satisfies the shape rather than a fresh team.
        if (a.starting !== b.starting) return a.starting ? -1 : 1;
        return strengthOf(b.fplId) - strengthOf(a.fplId);
      });
    for (const p of candidates.slice(0, want[pos])) startingIds.add(p.fplId);
  }

  const posOrder: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
  const xi = picks
    .filter((p) => startingIds.has(p.fplId))
    .sort(
      (a, b) =>
        posOrder[positionOf.get(a.fplId) ?? 'MID'] - posOrder[positionOf.get(b.fplId) ?? 'MID'] ||
        strengthOf(b.fplId) - strengthOf(a.fplId),
    );
  const bench = picks
    .filter((p) => !startingIds.has(p.fplId))
    .sort((a, b) => a.slot - b.slot);

  return [
    ...xi.map((p, i) => ({ ...p, starting: true, slot: i + 1 })),
    ...bench.map((p, i) => ({
      ...p,
      starting: false,
      slot: 12 + i,
      isCaptain: false,
      isVice: false,
    })),
  ];
}

// Bring a stored lineup back in line with who the manager actually owns.
//
// A lineup is a snapshot of fifteen players. Sign a free agent or win a
// waiver and that snapshot goes stale: the player you dropped is still in
// it and the one you gained is nowhere, so My Team shows a squad you no
// longer have. This reconciles the two, preserving as many of the
// manager's own choices as the rules allow.
//
// Anyone new arrives on the bench, because promoting a signing over a
// starter the manager picked is not our decision to make.
export function reconcileLineup(
  picks: LineupPick[],
  members: SquadPlayerInfo[],
): { picks: LineupPick[]; changed: boolean } {
  const memberIds = new Set(members.map((m) => m.fplId));
  const infoOf = new Map(members.map((m) => [m.fplId, m]));

  const kept = picks.filter((p) => memberIds.has(p.fplId));
  const added = members.filter((m) => !picks.some((p) => p.fplId === m.fplId));
  if (kept.length === picks.length && added.length === 0) {
    return { picks, changed: false };
  }

  const posOf = (id: number) => infoOf.get(id)?.position ?? 'MID';
  const formOf = (id: number) => infoOf.get(id)?.form ?? 0;

  let starters = kept.filter((p) => p.starting);
  const bench = [
    ...kept.filter((p) => !p.starting),
    // New arrivals sit at the back of the bench.
    ...added.map((m) => ({
      fplId: m.fplId,
      slot: 99,
      starting: false,
      isCaptain: false,
      isVice: false,
    })),
  ];

  const countOf = (list: typeof starters) => {
    const c: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of list) c[posOf(p.fplId)]++;
    return c;
  };

  // Too many starters (impossible today, but cheap to be safe): drop the
  // weakest whose position can spare one.
  while (starters.length > 11) {
    const c = countOf(starters);
    const droppable = starters
      .filter((p) => c[posOf(p.fplId)] > XI_MIN[posOf(p.fplId)])
      .sort((a, b) => formOf(a.fplId) - formOf(b.fplId));
    const out = droppable[0] ?? starters[starters.length - 1];
    starters = starters.filter((p) => p.fplId !== out.fplId);
    bench.push({ ...out, starting: false });
  }

  // Short of eleven because a starter was dropped: promote the best bench
  // player whose position still has room.
  const promoted = new Set<number>();
  while (starters.length < 11) {
    const c = countOf(starters);
    const candidate = bench
      .filter((p) => !promoted.has(p.fplId))
      .filter((p) => c[posOf(p.fplId)] < XI_MAX[posOf(p.fplId)])
      .sort((a, b) => formOf(b.fplId) - formOf(a.fplId))[0];
    if (!candidate) break;
    promoted.add(candidate.fplId);
    starters.push({ ...candidate, starting: true });
  }

  const remainingBench = bench.filter((p) => !promoted.has(p.fplId));
  const counts = countOf(starters);
  const legal =
    starters.length === 11 &&
    remainingBench.length === 4 &&
    POSITIONS_XI.every((pos) => counts[pos] >= XI_MIN[pos] && counts[pos] <= XI_MAX[pos]);

  // If preserving the manager's picks cannot produce a legal eleven, start
  // clean rather than save something the server would reject.
  if (!legal) {
    return { picks: generateAutoLineup(members), changed: true };
  }

  const posOrder: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
  const orderedXi = starters.sort(
    (a, b) => posOrder[posOf(a.fplId)] - posOrder[posOf(b.fplId)] || a.slot - b.slot,
  );
  const orderedBench = remainingBench.sort((a, b) => a.slot - b.slot);

  // An armband on someone who left, or who is now benched, is worth nothing.
  const startingIds = new Set(orderedXi.map((p) => p.fplId));
  let captain = picks.find((p) => p.isCaptain && startingIds.has(p.fplId))?.fplId;
  let vice = picks.find((p) => p.isVice && startingIds.has(p.fplId))?.fplId;
  if (captain == null) {
    captain = orderedXi.slice().sort((a, b) => formOf(b.fplId) - formOf(a.fplId))[0]?.fplId;
  }
  if (vice == null || vice === captain) {
    vice = orderedXi
      .slice()
      .sort((a, b) => formOf(b.fplId) - formOf(a.fplId))
      .find((p) => p.fplId !== captain)?.fplId;
  }

  return {
    picks: [
      ...orderedXi.map((p, i) => ({
        ...p,
        starting: true,
        slot: i + 1,
        isCaptain: p.fplId === captain,
        isVice: p.fplId === vice,
      })),
      ...orderedBench.map((p, i) => ({
        ...p,
        starting: false,
        slot: 12 + i,
        isCaptain: false,
        isVice: false,
      })),
    ],
    changed: true,
  };
}
