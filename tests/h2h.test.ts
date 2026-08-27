import { describe, expect, it } from 'vitest';
import {
  buildRegularSeason,
  buildSemis,
  buildFinals,
  roundRobinRounds,
  sortRecords,
  REGULAR_SEASON_END,
} from '@/lib/h2h-rules';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `u${i + 1}`);

describe('roundRobinRounds', () => {
  it('pairs everyone exactly once per round for an even field', () => {
    const rounds = roundRobinRounds(ids(8));
    expect(rounds).toHaveLength(7);
    for (const round of rounds) {
      const seen = round.flatMap(([h, a]) => [h, a]).filter(Boolean);
      expect(new Set(seen).size).toBe(8);
    }
  });

  it('has every manager face every other exactly once across a full cycle', () => {
    const rounds = roundRobinRounds(ids(6));
    const met = new Set<string>();
    for (const round of rounds) {
      for (const [h, a] of round) {
        if (!a) continue;
        met.add([h, a].sort().join('-'));
      }
    }
    // 6 managers -> 15 unique pairings.
    expect(met.size).toBe(15);
  });

  it('gives exactly one bye per round with an odd field', () => {
    const rounds = roundRobinRounds(ids(5));
    expect(rounds).toHaveLength(5);
    for (const round of rounds) {
      expect(round.filter(([, a]) => a === null)).toHaveLength(1);
    }
    // Everyone gets exactly one bye over the cycle.
    const byes = rounds.flat().filter(([, a]) => a === null).map(([h]) => h);
    expect(new Set(byes).size).toBe(5);
  });
});

describe('buildRegularSeason', () => {
  it('covers every gameweek to the regular season end', () => {
    const matches = buildRegularSeason(ids(8));
    const gws = new Set(matches.map((m) => m.gw));
    expect(Math.min(...gws)).toBe(1);
    expect(Math.max(...gws)).toBe(REGULAR_SEASON_END);
    expect(gws.size).toBe(REGULAR_SEASON_END);
  });

  it('gives each manager exactly one fixture per gameweek', () => {
    const matches = buildRegularSeason(ids(6));
    for (let gw = 1; gw <= REGULAR_SEASON_END; gw++) {
      const week = matches.filter((m) => m.gw === gw);
      const players = week.flatMap((m) => [m.homeUserId, m.awayUserId]).filter(Boolean);
      expect(new Set(players).size).toBe(6);
    }
  });

  it('returns nothing for a one-manager league', () => {
    expect(buildRegularSeason(ids(1))).toEqual([]);
  });

  it('starts at the league start gameweek when drafted mid-season', () => {
    const matches = buildRegularSeason(ids(8), 12);
    const gws = new Set(matches.map((m) => m.gw));
    expect(Math.min(...gws)).toBe(12);
    expect(Math.max(...gws)).toBe(REGULAR_SEASON_END);
    // Still one fixture each, every week, from the start gameweek on.
    for (let gw = 12; gw <= REGULAR_SEASON_END; gw++) {
      const week = matches.filter((m) => m.gw === gw);
      const players = week.flatMap((m) => [m.homeUserId, m.awayUserId]).filter(Boolean);
      expect(new Set(players).size).toBe(8);
    }
  });
});

describe('playoffs', () => {
  it('seeds 1v4 and 2v3', () => {
    const semis = buildSemis(ids(4));
    expect(semis).toHaveLength(2);
    expect([semis[0].homeUserId, semis[0].awayUserId]).toEqual(['u1', 'u4']);
    expect([semis[1].homeUserId, semis[1].awayUserId]).toEqual(['u2', 'u3']);
  });

  it('falls back to a straight final for a tiny league', () => {
    const semis = buildSemis(ids(2));
    expect(semis).toHaveLength(1);
  });

  it('builds a final and a third place game', () => {
    const finals = buildFinals(['a', 'b'], ['c', 'd']);
    expect(finals.map((f) => f.round)).toEqual(['final', 'third']);
  });
});

describe('sortRecords', () => {
  it('ranks by wins, then points scored', () => {
    const sorted = sortRecords([
      { userId: 'a', wins: 3, losses: 2, draws: 0, pointsFor: 300, pointsAgainst: 280 },
      { userId: 'b', wins: 4, losses: 1, draws: 0, pointsFor: 250, pointsAgainst: 240 },
      { userId: 'c', wins: 3, losses: 2, draws: 0, pointsFor: 320, pointsAgainst: 300 },
    ]);
    expect(sorted.map((r) => r.userId)).toEqual(['b', 'c', 'a']);
  });

  it('counts a draw as half a win', () => {
    const sorted = sortRecords([
      { userId: 'a', wins: 2, losses: 0, draws: 0, pointsFor: 100, pointsAgainst: 90 },
      { userId: 'b', wins: 2, losses: 0, draws: 1, pointsFor: 100, pointsAgainst: 90 },
    ]);
    expect(sorted[0].userId).toBe('b');
  });
});
