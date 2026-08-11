// The actual Premier League table, computed from the synced fixtures
// mirror. Pure function: counts every fixture with a score, including
// in-progress ones, so the table is live during matches exactly like the
// broadcast graphics. Standard tiebreaks: points, goal difference, goals
// scored, then name.

export type PLFixtureRow = {
  homeClub: number;
  awayClub: number;
  homeScore: number | null;
  awayScore: number | null;
  started: boolean;
  finished: boolean;
};

export type PLTableRow = {
  clubId: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  // True while this club is mid-match, so the row can carry a LIVE dot.
  live: boolean;
};

export function computePLTable(
  fixtures: PLFixtureRow[],
  clubIds: number[],
  nameOf: (clubId: number) => string,
): PLTableRow[] {
  const rows = new Map<number, PLTableRow>();
  for (const id of clubIds) {
    rows.set(id, {
      clubId: id,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0,
      live: false,
    });
  }
  for (const f of fixtures) {
    if (!f.started || f.homeScore == null || f.awayScore == null) continue;
    const home = rows.get(f.homeClub);
    const away = rows.get(f.awayClub);
    if (!home || !away) continue;
    const live = f.started && !f.finished;
    home.live ||= live;
    away.live ||= live;
    home.played++;
    away.played++;
    home.goalsFor += f.homeScore;
    home.goalsAgainst += f.awayScore;
    away.goalsFor += f.awayScore;
    away.goalsAgainst += f.homeScore;
    if (f.homeScore > f.awayScore) {
      home.won++;
      home.points += 3;
      away.lost++;
    } else if (f.homeScore < f.awayScore) {
      away.won++;
      away.points += 3;
      home.lost++;
    } else {
      home.drawn++;
      away.drawn++;
      home.points++;
      away.points++;
    }
  }
  for (const r of rows.values()) r.goalDiff = r.goalsFor - r.goalsAgainst;
  return [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDiff - a.goalDiff ||
      b.goalsFor - a.goalsFor ||
      nameOf(a.clubId).localeCompare(nameOf(b.clubId)),
  );
}
