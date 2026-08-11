// Pure scoring rules: no DB, fully unit-testable.
// Points per player come from FPL verbatim (gw_player_points.total_points,
// bonus included). This module only decides WHO counts (autosubs) and the
// captain doubling; it never recomputes player points from raw stats.
import type { AutoSub, LineupPick } from './schema';
import { XI_MAX, XI_MIN } from './lineup-rules';

export type PlayerGwStat = {
  minutes: number;
  totalPoints: number;
  goals: number;
};

export type ScoreResult = {
  rawPoints: number;
  captainBonus: number;
  totalPoints: number;
  autosubs: AutoSub[];
  goals: number;
  finalXi: number[];
};

const ZERO: PlayerGwStat = { minutes: 0, totalPoints: 0, goals: 0 };

// Standard FPL autosubs, run only once a GW's fixtures are finished: each
// starter with 0 minutes is replaced by the first bench player (bench order
// 12-15) who played AND keeps the formation valid. A goalkeeper can only be
// replaced by the bench goalkeeper, and the bench GK can only come on for a
// GK. Players a club simply did not field (blank GW) score 0 like FPL.
export function applyAutosubs(
  picks: LineupPick[],
  statOf: Map<number, PlayerGwStat>,
  posOf: Map<number, string>,
): { finalXi: number[]; autosubs: AutoSub[] } {
  const xi = picks.filter((p) => p.starting).map((p) => p.fplId);
  const bench = picks
    .filter((p) => !p.starting)
    .sort((a, b) => a.slot - b.slot)
    .map((p) => p.fplId);
  const autosubs: AutoSub[] = [];
  const used = new Set<number>();

  const counts = (ids: number[]): Record<string, number> => {
    const c: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const id of ids) c[posOf.get(id) ?? 'MID']++;
    return c;
  };

  for (const starterId of xi.slice()) {
    const played = (statOf.get(starterId) ?? ZERO).minutes > 0;
    if (played) continue;
    const starterPos = posOf.get(starterId) ?? 'MID';
    for (const benchId of bench) {
      if (used.has(benchId)) continue;
      if ((statOf.get(benchId) ?? ZERO).minutes <= 0) continue;
      const benchPos = posOf.get(benchId) ?? 'MID';
      // GK slots swap only with GK.
      if ((starterPos === 'GK') !== (benchPos === 'GK')) continue;
      const idx = xi.indexOf(starterId);
      const candidate = xi.slice();
      candidate[idx] = benchId;
      const c = counts(candidate);
      const valid = Object.keys(XI_MIN).every(
        (pos) => c[pos] >= XI_MIN[pos] && c[pos] <= XI_MAX[pos],
      );
      if (!valid) continue;
      xi[idx] = benchId;
      used.add(benchId);
      autosubs.push({ outFplId: starterId, inFplId: benchId });
      break;
    }
  }
  return { finalXi: xi, autosubs };
}

// Final score for a finished, data-checked GW.
export function computeFinalScore(
  picks: LineupPick[],
  statOf: Map<number, PlayerGwStat>,
  posOf: Map<number, string>,
): ScoreResult {
  const { finalXi, autosubs } = applyAutosubs(picks, statOf, posOf);
  const stat = (id: number) => statOf.get(id) ?? ZERO;
  const rawPoints = finalXi.reduce((sum, id) => sum + stat(id).totalPoints, 0);
  const goals = finalXi.reduce((sum, id) => sum + stat(id).goals, 0);

  const captain = picks.find((p) => p.isCaptain)?.fplId;
  const vice = picks.find((p) => p.isVice)?.fplId;
  // Captain doubles. If the captain played 0 minutes, the vice doubles
  // instead. If both played 0, nobody doubles. An autosubbed-out captain by
  // definition played 0 minutes.
  let captainBonus = 0;
  if (captain != null && stat(captain).minutes > 0) {
    captainBonus = stat(captain).totalPoints;
  } else if (vice != null && stat(vice).minutes > 0) {
    captainBonus = stat(vice).totalPoints;
  }
  return {
    rawPoints,
    captainBonus,
    totalPoints: rawPoints + captainBonus,
    autosubs,
    goals,
    finalXi,
  };
}

// Provisional score during live play: current live totals for the named XI,
// no autosubs yet, captain doubling applied optimistically (the captain may
// simply not have kicked off yet).
export function computeProvisionalScore(
  picks: LineupPick[],
  statOf: Map<number, PlayerGwStat>,
): ScoreResult {
  const stat = (id: number) => statOf.get(id) ?? ZERO;
  const xi = picks.filter((p) => p.starting).map((p) => p.fplId);
  const rawPoints = xi.reduce((sum, id) => sum + stat(id).totalPoints, 0);
  const goals = xi.reduce((sum, id) => sum + stat(id).goals, 0);
  const captain = picks.find((p) => p.isCaptain)?.fplId;
  const captainBonus = captain != null ? stat(captain).totalPoints : 0;
  return {
    rawPoints,
    captainBonus,
    totalPoints: rawPoints + captainBonus,
    autosubs: [],
    goals,
    finalXi: xi,
  };
}
