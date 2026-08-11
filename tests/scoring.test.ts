import { describe, expect, it } from 'vitest';
import {
  applyAutosubs,
  computeFinalScore,
  computeProvisionalScore,
  type PlayerGwStat,
} from '@/lib/scoring-rules';
import type { LineupPick } from '@/lib/schema';

// Squad ids: 1-2 GK, 3-7 DEF, 8-12 MID, 13-15 FWD.
// Default lineup: 1 GK, 3-6 DEF (4), 8-11 MID (4), 13-14 FWD (2) = 1-4-4-2.
// Bench order: 12 -> GK 2, 13 -> DEF 7, 14 -> MID 12, 15 -> FWD 15.
const POS = new Map<number, string>([
  [1, 'GK'], [2, 'GK'],
  [3, 'DEF'], [4, 'DEF'], [5, 'DEF'], [6, 'DEF'], [7, 'DEF'],
  [8, 'MID'], [9, 'MID'], [10, 'MID'], [11, 'MID'], [12, 'MID'],
  [13, 'FWD'], [14, 'FWD'], [15, 'FWD'],
]);

function lineup(captain = 8, vice = 9): LineupPick[] {
  const starters = [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14];
  const bench = [2, 7, 12, 15];
  return [
    ...starters.map((fplId, i) => ({
      fplId,
      slot: i + 1,
      starting: true,
      isCaptain: fplId === captain,
      isVice: fplId === vice,
    })),
    ...bench.map((fplId, i) => ({
      fplId,
      slot: 12 + i,
      starting: false,
      isCaptain: false,
      isVice: false,
    })),
  ];
}

function stats(over: Record<number, Partial<PlayerGwStat>> = {}): Map<number, PlayerGwStat> {
  const m = new Map<number, PlayerGwStat>();
  for (const id of POS.keys()) {
    m.set(id, { minutes: 90, totalPoints: 2, goals: 0, ...over[id] });
  }
  return m;
}

describe('computeFinalScore', () => {
  it('sums the XI and doubles the captain', () => {
    const s = stats({ 8: { totalPoints: 10 } });
    const r = computeFinalScore(lineup(), s, POS);
    // XI = 11 players: 10 x 2 + 10 = 30 raw, captain bonus 10.
    expect(r.rawPoints).toBe(30);
    expect(r.captainBonus).toBe(10);
    expect(r.totalPoints).toBe(40);
  });

  it('falls back to the vice when the captain played 0 minutes', () => {
    const s = stats({
      8: { minutes: 0, totalPoints: 0 },
      9: { totalPoints: 6 },
    });
    const r = computeFinalScore(lineup(), s, POS);
    // Captain (8, MID) subbed out for the first valid bench player, DEF 7
    // (1-5-3-2 keeps the minimums). Vice doubles.
    expect(r.captainBonus).toBe(6);
    expect(r.autosubs).toContainEqual({ outFplId: 8, inFplId: 7 });
  });

  it('doubles nobody when captain and vice both played 0', () => {
    const s = stats({
      8: { minutes: 0, totalPoints: 0 },
      9: { minutes: 0, totalPoints: 0 },
    });
    const r = computeFinalScore(lineup(), s, POS);
    expect(r.captainBonus).toBe(0);
  });

  it('blank GW: everyone at 0 minutes scores 0', () => {
    const s = new Map<number, PlayerGwStat>();
    for (const id of POS.keys()) s.set(id, { minutes: 0, totalPoints: 0, goals: 0 });
    const r = computeFinalScore(lineup(), s, POS);
    expect(r.totalPoints).toBe(0);
  });

  it('counts XI goals for the tiebreak', () => {
    const s = stats({ 13: { goals: 2 }, 2: { goals: 5 } }); // bench GK goals do not count
    const r = computeFinalScore(lineup(), s, POS);
    expect(r.goals).toBe(2);
  });
});

describe('applyAutosubs', () => {
  it('replaces a 0-minute starter with the first bench player who played', () => {
    const s = stats({ 13: { minutes: 0 } });
    const { finalXi, autosubs } = applyAutosubs(lineup(), s, POS);
    // FWD 13 out; bench order is 7 (DEF) first, which keeps 1-5-4-1 valid.
    expect(autosubs).toEqual([{ outFplId: 13, inFplId: 7 }]);
    expect(finalXi).toContain(7);
    expect(finalXi).not.toContain(13);
  });

  it('skips bench players who did not play', () => {
    const s = stats({ 13: { minutes: 0 }, 7: { minutes: 0 } });
    const { autosubs } = applyAutosubs(lineup(), s, POS);
    // DEF 7 also blanked, so MID 12 comes in (1-4-5-1, valid).
    expect(autosubs).toEqual([{ outFplId: 13, inFplId: 12 }]);
  });

  it('respects the formation floor: last striker cannot leave the XI without a FWD... unless a valid shape remains', () => {
    // Both FWDs blank, bench FWD 15 also blank: subs must keep >= 1 FWD, so
    // only one of the two FWD slots can be filled by outfielders.
    const s = stats({ 13: { minutes: 0 }, 14: { minutes: 0 }, 15: { minutes: 0 } });
    const { finalXi, autosubs } = applyAutosubs(lineup(), s, POS);
    // 13 -> 7 (DEF) gives 1-5-4-1. 14 has no valid replacement (12 in would
    // make 0 FWD... 12 is MID -> 1-5-5-0 invalid), so 14 stays.
    expect(autosubs).toEqual([{ outFplId: 13, inFplId: 7 }]);
    expect(finalXi).toContain(14);
  });

  it('goalkeeper swaps only with the bench goalkeeper', () => {
    const s = stats({ 1: { minutes: 0 } });
    const { autosubs } = applyAutosubs(lineup(), s, POS);
    expect(autosubs).toEqual([{ outFplId: 1, inFplId: 2 }]);
  });

  it('no sub when the bench GK also blanked', () => {
    const s = stats({ 1: { minutes: 0 }, 2: { minutes: 0 } });
    const { autosubs, finalXi } = applyAutosubs(lineup(), s, POS);
    expect(autosubs).toEqual([]);
    expect(finalXi).toContain(1);
  });
});

describe('computeProvisionalScore', () => {
  it('applies captain doubling optimistically with no autosubs', () => {
    const s = stats({ 8: { minutes: 0, totalPoints: 0 }, 12: { totalPoints: 9 } });
    const r = computeProvisionalScore(lineup(), s);
    // Captain has not played yet: optimistic doubling of current 0, no subs.
    expect(r.captainBonus).toBe(0);
    expect(r.autosubs).toEqual([]);
    // Bench MID 12's 9 points do NOT count provisionally.
    expect(r.rawPoints).toBe(20);
  });
});
