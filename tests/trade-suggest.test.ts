import { describe, expect, it } from 'vitest';
import { suggestTrades, value, type SuggestPlayer } from '../src/lib/trade-suggest';

let id = 0;
const p = (position: string, lastSeasonPoints: number | null, name = `P${++id}`): SuggestPlayer => ({
  fplId: id,
  webName: name,
  position,
  clubShort: 'XXX',
  lastSeasonPoints,
  draftRank: null,
  totalPoints: 0,
});

// A legal squad: 2 GK, 5 DEF, 5 MID, 3 FWD.
function squad(midPoints: number[], fwdPoints: number[]): SuggestPlayer[] {
  return [
    p('GK', 100),
    p('GK', 60),
    ...[150, 140, 130, 120, 110].map((v) => p('DEF', v)),
    ...midPoints.map((v) => p('MID', v)),
    ...fwdPoints.map((v) => p('FWD', v)),
  ];
}

describe('value', () => {
  it('prefers last season points', () => {
    expect(value(p('MID', 180))).toBe(180);
  });

  it('falls back to draft rank for players with no PL history', () => {
    const rookie: SuggestPlayer = { ...p('MID', null), draftRank: 20 };
    expect(value(rookie)).toBe(180);
  });
});

describe('suggestTrades', () => {
  it('finds a mutually useful two for two', () => {
    // Deep in midfield, thin up front.
    const mine = squad([200, 190, 180, 170, 160], [90, 40, 30]);
    // The mirror image.
    const theirs = squad([90, 80, 70, 60, 50], [210, 200, 190]);
    const out = suggestTrades(mine, [{ userId: 'u2', username: 'Rival', players: theirs }]);
    expect(out.length).toBeGreaterThan(0);
    const best = out[0];
    expect(best.give).toHaveLength(2);
    expect(best.get).toHaveLength(2);
    expect(best.yourGain).toBeGreaterThan(0);
    expect(best.theirGain).toBeGreaterThan(0);
  });

  it('keeps every position count intact', () => {
    const mine = squad([200, 190, 180, 170, 160], [90, 40, 30]);
    const theirs = squad([90, 80, 70, 60, 50], [210, 200, 190]);
    const [best] = suggestTrades(mine, [{ userId: 'u2', username: 'Rival', players: theirs }]);
    const count = (list: SuggestPlayer[], pos: string) =>
      list.filter((x) => x.position === pos).length;
    for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
      expect(count(best.give, pos)).toBe(count(best.get, pos));
    }
  });

  it('suggests nothing between two identical squads', () => {
    const mine = squad([200, 190, 180, 170, 160], [150, 140, 130]);
    const theirs = squad([200, 190, 180, 170, 160], [150, 140, 130]);
    expect(suggestTrades(mine, [{ userId: 'u2', username: 'Twin', players: theirs }])).toEqual([]);
  });

  it('never proposes a deal that only helps one side', () => {
    const mine = squad([200, 190, 180, 170, 160], [90, 40, 30]);
    const theirs = squad([90, 80, 70, 60, 50], [210, 200, 190]);
    for (const s of suggestTrades(mine, [{ userId: 'u2', username: 'Rival', players: theirs }])) {
      expect(s.yourGain).toBeGreaterThan(0);
      expect(s.theirGain).toBeGreaterThan(0);
    }
  });
});
