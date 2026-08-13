// Pure head-to-head scheduling. No DB, fully unit-testable.
//
// Season shape: a round-robin repeated until the regular season ends, then
// the top four seeds play semi-finals and a final on the last two gameweeks.
// Ending on GW38 means the title is decided on the final day.

export const REGULAR_SEASON_END = 36;
export const SEMIS_GW = 37;
export const FINAL_GW = 38;

export type ScheduledMatch = {
  gw: number;
  slot: number;
  homeUserId: string;
  awayUserId: string | null;
  round: 'regular' | 'semi' | 'final' | 'third';
};

// Circle method: fix the first entry, rotate the rest. With an odd number of
// managers a null placeholder rides along and whoever draws it gets a bye.
export function roundRobinRounds(userIds: string[]): (readonly [string, string | null])[][] {
  const ids: (string | null)[] = [...userIds];
  if (ids.length % 2 === 1) ids.push(null);
  const n = ids.length;
  const rounds: (readonly [string, string | null])[][] = [];

  for (let r = 0; r < n - 1; r++) {
    const pairs: (readonly [string, string | null])[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i];
      const b = ids[n - 1 - i];
      if (a == null && b == null) continue;
      // Alternate home and away by round so the split stays even.
      const home = r % 2 === 0 ? a : b;
      const away = r % 2 === 0 ? b : a;
      if (home == null) {
        // The real side takes the bye rather than being dropped.
        pairs.push([away as string, null] as const);
      } else {
        pairs.push([home, away] as const);
      }
    }
    rounds.push(pairs);
    // Rotate everything except the first entry.
    const fixed = ids[0];
    const rest = ids.slice(1);
    rest.unshift(rest.pop()!);
    ids.splice(0, ids.length, fixed, ...rest);
  }
  return rounds;
}

// The full regular season: cycle the round-robin from GW1 until the regular
// season ends, so every manager plays every gameweek.
export function buildRegularSeason(
  userIds: string[],
  fromGw = 1,
  toGw = REGULAR_SEASON_END,
): ScheduledMatch[] {
  if (userIds.length < 2) return [];
  const rounds = roundRobinRounds(userIds);
  const out: ScheduledMatch[] = [];
  for (let gw = fromGw; gw <= toGw; gw++) {
    const round = rounds[(gw - fromGw) % rounds.length];
    round.forEach(([home, away], i) => {
      out.push({ gw, slot: i, homeUserId: home, awayUserId: away, round: 'regular' });
    });
  }
  return out;
}

// Seeds 1v4 and 2v3 in the semis; winners meet in the final, losers play for
// third. Fewer than four managers still gets a final between the top two.
export function buildSemis(seeds: string[]): ScheduledMatch[] {
  if (seeds.length >= 4) {
    return [
      { gw: SEMIS_GW, slot: 0, homeUserId: seeds[0], awayUserId: seeds[3], round: 'semi' },
      { gw: SEMIS_GW, slot: 1, homeUserId: seeds[1], awayUserId: seeds[2], round: 'semi' },
    ];
  }
  if (seeds.length >= 2) {
    return [
      { gw: SEMIS_GW, slot: 0, homeUserId: seeds[0], awayUserId: seeds[1], round: 'semi' },
    ];
  }
  return [];
}

export function buildFinals(
  winners: string[],
  losers: string[],
): ScheduledMatch[] {
  const out: ScheduledMatch[] = [];
  if (winners.length >= 2) {
    out.push({
      gw: FINAL_GW,
      slot: 0,
      homeUserId: winners[0],
      awayUserId: winners[1],
      round: 'final',
    });
  }
  if (losers.length >= 2) {
    out.push({
      gw: FINAL_GW,
      slot: 1,
      homeUserId: losers[0],
      awayUserId: losers[1],
      round: 'third',
    });
  }
  return out;
}

export type H2HRecord = {
  userId: string;
  wins: number;
  losses: number;
  draws: number;
  pointsFor: number;
  pointsAgainst: number;
};

// Standings order: wins, then head-to-head points scored, then fewest
// conceded. A draw counts half a win for ordering purposes.
export function sortRecords(records: H2HRecord[]): H2HRecord[] {
  return records
    .slice()
    .sort(
      (a, b) =>
        b.wins + b.draws * 0.5 - (a.wins + a.draws * 0.5) ||
        b.pointsFor - a.pointsFor ||
        a.pointsAgainst - b.pointsAgainst ||
        a.userId.localeCompare(b.userId),
    );
}
