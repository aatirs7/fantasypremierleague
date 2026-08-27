// Draft grades. Pure, no DB, fully unit-testable.
//
// A grade is not "who has the most points" (nobody has any yet). It is a
// judgement on the draft itself: did you take the best available player, did
// you cover every position, and did you spend early picks on players who
// cannot get on the pitch. Each signal is measured against what the rest of
// the league actually did, so a grade means something inside this league
// rather than against an abstract ideal.

export type GradePlayer = {
  fplId: number;
  webName: string;
  position: string;
  clubShort: string;
  // FPL's own pre-season pick order. Lower is better.
  draftRank: number | null;
  lastSeasonPoints: number | null;
  // a available, d doubtful, i injured, s suspended, u departed
  status: string;
  // 1-based overall pick this player was taken with.
  pickNumber: number;
  autoPicked: boolean;
};

export type GradeEntry = {
  userId: string;
  username: string;
  players: GradePlayer[];
};

export type Grade = {
  userId: string;
  username: string;
  grade: string;
  score: number;
  headline: string;
  notes: string[];
};

const STARTERS: Record<string, number> = { GK: 1, DEF: 4, MID: 4, FWD: 2 };
const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];

// What a player is worth. Last season's points are the honest signal; a
// player with no Premier League history falls back to his draft rank, which
// is FPL's own projection of the same thing.
export function playerValue(p: GradePlayer): number {
  if (p.lastSeasonPoints != null) return p.lastSeasonPoints;
  if (p.draftRank != null) return Math.max(0, 210 - p.draftRank);
  return 0;
}

function startingValue(players: GradePlayer[]): number {
  let total = 0;
  for (const pos of POSITIONS) {
    const ranked = players
      .filter((p) => p.position === pos)
      .sort((a, b) => playerValue(b) - playerValue(a));
    total += ranked.slice(0, STARTERS[pos] ?? 1).reduce((s, p) => s + playerValue(p), 0);
  }
  return total;
}

// Anyone who cannot be picked this week. Departures and injuries are a
// wasted roster spot; a doubt is only half a problem.
function unavailableCost(players: GradePlayer[]): number {
  let cost = 0;
  for (const p of players) {
    // Only the picks that were meant to matter. A round 14 flier is fine.
    const weight = p.pickNumber <= 60 ? 1 : 0.4;
    if (p.status === 'i' || p.status === 's' || p.status === 'u') cost += weight;
    else if (p.status === 'd') cost += weight * 0.5;
  }
  return cost;
}

// Did you take players who had already fallen past their rank (a steal), or
// reach for someone the board said would still be there next time round?
function rankEdge(players: GradePlayer[], managers: number): number {
  let edge = 0;
  for (const p of players) {
    if (p.draftRank == null) continue;
    // Expected rank available at this pick, roughly the pick number itself.
    edge += (p.pickNumber - p.draftRank) / managers;
  }
  return edge;
}

function biggestClubStack(players: GradePlayer[]): { club: string; count: number } {
  const counts = new Map<string, number>();
  for (const p of players) counts.set(p.clubShort, (counts.get(p.clubShort) ?? 0) + 1);
  let club = '';
  let count = 0;
  for (const [c, n] of counts) {
    if (n > count) {
      club = c;
      count = n;
    }
  }
  return { club, count };
}

// Round the first goalkeeper went. Spending an early pick on a keeper is the
// classic rookie mistake: the gap between the best keeper and the tenth is
// far smaller than the gap between the best forward and the tenth.
function firstKeeperRound(players: GradePlayer[], managers: number): number | null {
  const keepers = players.filter((p) => p.position === 'GK');
  if (!keepers.length) return null;
  const earliest = Math.min(...keepers.map((p) => p.pickNumber));
  return Math.ceil(earliest / managers);
}

function letterFor(score: number): string {
  if (score >= 92) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 79) return 'A-';
  if (score >= 73) return 'B+';
  if (score >= 66) return 'B';
  if (score >= 60) return 'B-';
  if (score >= 54) return 'C+';
  if (score >= 47) return 'C';
  if (score >= 41) return 'C-';
  if (score >= 34) return 'D+';
  if (score >= 27) return 'D';
  return 'F';
}

export function gradeDraft(entries: GradeEntry[]): Grade[] {
  if (!entries.length) return [];
  const managers = entries.length;

  const measured = entries.map((e) => ({
    entry: e,
    starting: startingValue(e.players),
    unavailable: unavailableCost(e.players),
    edge: rankEdge(e.players, managers),
    stack: biggestClubStack(e.players),
    keeperRound: firstKeeperRound(e.players, managers),
    autos: e.players.filter((p) => p.autoPicked).length,
  }));

  const avgStarting =
    measured.reduce((s, m) => s + m.starting, 0) / Math.max(1, measured.length);
  const spread = Math.max(
    1,
    Math.max(...measured.map((m) => Math.abs(m.starting - avgStarting))),
  );

  return measured
    .map((m) => {
      // Squad quality against this league, worth most of the grade.
      const quality = ((m.starting - avgStarting) / spread) * 22;
      // Value taken relative to where the board said players should go.
      const value = Math.max(-12, Math.min(12, m.edge * 1.4));
      // Roster spots that cannot play.
      const health = -m.unavailable * 4.5;
      // A club stack is a correlated risk, not a crime, until it is five deep.
      const stackPenalty = m.stack.count >= 4 ? -(m.stack.count - 3) * 3 : 0;
      // An early keeper is a pick spent on the smallest edge available.
      const keeperPenalty =
        m.keeperRound != null && m.keeperRound <= 3 ? -(4 - m.keeperRound) * 3 : 0;
      const autoPenalty = -m.autos * 1.5;

      const score = Math.max(
        5,
        Math.min(99, 66 + quality + value + health + stackPenalty + keeperPenalty + autoPenalty),
      );

      // The reason is whichever signal actually moved the needle, so no two
      // managers get the same sentence unless they made the same mistake.
      const notes: string[] = [];
      const best = m.entry.players
        .slice()
        .sort((a, b) => playerValue(b) - playerValue(a))[0];

      if (quality > 8 && best) {
        notes.push(`${best.webName} anchors the best starting eleven in the league on paper.`);
      } else if (quality < -8) {
        notes.push('The starting eleven is the thinnest here once you line them all up.');
      }

      const steal = m.entry.players
        .filter((p) => p.draftRank != null && p.pickNumber - p.draftRank >= managers * 2)
        .sort((a, b) => b.pickNumber - b.draftRank! - (a.pickNumber - a.draftRank!))[0];
      if (steal) {
        notes.push(
          `${steal.webName} at pick ${steal.pickNumber} was ${steal.pickNumber - steal.draftRank!} spots later than the board said. Daylight robbery.`,
        );
      }

      const reach = m.entry.players
        .filter((p) => p.draftRank != null && p.draftRank - p.pickNumber >= managers * 3)
        .sort((a, b) => a.draftRank! - a.pickNumber - (b.draftRank! - b.pickNumber))[0];
      if (reach) {
        notes.push(
          `${reach.webName} went ${reach.draftRank! - reach.pickNumber} spots early. Nobody was taking him.`,
        );
      }

      const hurt = m.entry.players
        .filter((p) => p.pickNumber <= 60 && ['i', 's', 'u'].includes(p.status))
        .sort((a, b) => a.pickNumber - b.pickNumber);
      if (hurt.length >= 2) {
        notes.push(
          `${hurt.length} of your early picks cannot play right now: ${hurt.map((p) => p.webName).join(', ')}.`,
        );
      } else if (hurt.length === 1) {
        notes.push(`${hurt[0].webName} is unavailable, and he was an early pick.`);
      }

      if (m.stack.count >= 4) {
        notes.push(
          `${m.stack.count} ${m.stack.club} players. When they have a bad weekend, so do you.`,
        );
      }
      if (m.keeperRound != null && m.keeperRound <= 3) {
        notes.push(
          `A goalkeeper in round ${m.keeperRound}. The gap between the best keeper and the tenth is not worth a pick that early.`,
        );
      }
      if (m.autos > 0) {
        notes.push(
          `${m.autos} pick${m.autos === 1 ? '' : 's'} made by the clock while you were away.`,
        );
      }
      if (!notes.length) {
        notes.push('A tidy draft with nothing to hang it on, good or bad.');
      }

      return {
        userId: m.entry.userId,
        username: m.entry.username,
        grade: letterFor(score),
        score: Math.round(score),
        headline: notes[0],
        notes,
      };
    })
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Awards
//
// The grade says how well you drafted. The awards say what everyone will
// actually argue about. One winner each, always awarded to somebody, and
// only included when the data genuinely supports it.

export type Award = {
  key: string;
  title: string;
  userId: string;
  username: string;
  subject: string;
  line: string;
};

export function draftAwards(entries: GradeEntry[]): Award[] {
  if (entries.length < 2) return [];
  const managers = entries.length;
  const awards: Award[] = [];

  const all = entries.flatMap((e) => e.players.map((p) => ({ e, p })));

  // The player who fell furthest past his own draft rank.
  const steal = all
    .filter((x) => x.p.draftRank != null)
    .sort((a, b) => b.p.pickNumber - b.p.draftRank! - (a.p.pickNumber - a.p.draftRank!))[0];
  if (steal && steal.p.pickNumber - steal.p.draftRank! >= managers) {
    awards.push({
      key: 'steal',
      title: 'Daylight Robbery',
      userId: steal.e.userId,
      username: steal.e.username,
      subject: steal.p.webName,
      line: `Sat there ${steal.p.pickNumber - steal.p.draftRank!} picks longer than he should have. Everyone else was asleep.`,
    });
  }

  // The player taken furthest ahead of his rank.
  const reach = all
    .filter((x) => x.p.draftRank != null)
    .sort((a, b) => a.p.draftRank! - a.p.pickNumber - (b.p.draftRank! - b.p.pickNumber))[0];
  if (reach && reach.p.draftRank! - reach.p.pickNumber >= managers * 2) {
    awards.push({
      key: 'reach',
      title: 'Nobody Was Bidding',
      userId: reach.e.userId,
      username: reach.e.username,
      subject: reach.p.webName,
      line: `Taken ${reach.p.draftRank! - reach.p.pickNumber} spots early. He was not going anywhere.`,
    });
  }

  // Most players who cannot currently play.
  const sick = entries
    .map((e) => ({
      e,
      hurt: e.players.filter((p) => ['i', 's', 'u'].includes(p.status) && p.pickNumber <= 60),
    }))
    .sort((a, b) => b.hurt.length - a.hurt.length)[0];
  if (sick && sick.hurt.length >= 2) {
    awards.push({
      key: 'sickbay',
      title: 'The Treatment Room',
      userId: sick.e.userId,
      username: sick.e.username,
      subject: sick.hurt.map((p) => p.webName).join(', '),
      line: `${sick.hurt.length} early picks who cannot kick a ball. Not a squad, a waiting room.`,
    });
  }

  // Deepest single-club stack.
  const homer = entries
    .map((e) => ({ e, stack: biggestClubStack(e.players) }))
    .sort((a, b) => b.stack.count - a.stack.count)[0];
  if (homer && homer.stack.count >= 4) {
    awards.push({
      key: 'homer',
      title: 'Season Ticket Holder',
      userId: homer.e.userId,
      username: homer.e.username,
      subject: `${homer.stack.count} ${homer.stack.club} players`,
      line: `When ${homer.stack.club} lose 4-0, so do you. Diversification is free.`,
    });
  }

  // Most picks handed to the clock.
  const asleep = entries
    .map((e) => ({ e, autos: e.players.filter((p) => p.autoPicked).length }))
    .sort((a, b) => b.autos - a.autos)[0];
  if (asleep && asleep.autos >= 1) {
    awards.push({
      key: 'asleep',
      title: 'Drafted By The Clock',
      userId: asleep.e.userId,
      username: asleep.e.username,
      subject: `${asleep.autos} auto pick${asleep.autos === 1 ? '' : 's'}`,
      line: 'Turned up to a draft and let the timer do the hard part.',
    });
  }

  // Earliest goalkeeper.
  const keeper = entries
    .map((e) => ({ e, round: firstKeeperRound(e.players, managers) }))
    .filter((x) => x.round != null)
    .sort((a, b) => a.round! - b.round!)[0];
  if (keeper && keeper.round! <= 4) {
    const gk = keeper.e.players
      .filter((p) => p.position === 'GK')
      .sort((a, b) => a.pickNumber - b.pickNumber)[0];
    awards.push({
      key: 'keeper',
      title: 'Panic Between The Sticks',
      userId: keeper.e.userId,
      username: keeper.e.username,
      subject: `${gk?.webName ?? 'A keeper'}, round ${keeper.round}`,
      line: 'Nobody has ever won a league because they got the fourth best goalkeeper first.',
    });
  }

  // Best starting eleven on paper.
  const best = entries
    .map((e) => ({ e, strength: startingValue(e.players) }))
    .sort((a, b) => b.strength - a.strength)[0];
  if (best) {
    const star = best.e.players.slice().sort((a, b) => playerValue(b) - playerValue(a))[0];
    awards.push({
      key: 'best',
      title: 'Best On Paper',
      userId: best.e.userId,
      username: best.e.username,
      subject: star ? `Led by ${star.webName}` : 'The strongest eleven',
      line: 'Paper does not play the fixtures, but it is a nice place to start.',
    });
  }

  // Best player taken in the last three rounds.
  const lateRoundStart = managers * 12;
  const late = all
    .filter((x) => x.p.pickNumber > lateRoundStart)
    .sort((a, b) => playerValue(b.p) - playerValue(a.p))[0];
  if (late && playerValue(late.p) > 60) {
    awards.push({
      key: 'bargain',
      title: 'Bargain Bin',
      userId: late.e.userId,
      username: late.e.username,
      subject: late.p.webName,
      line: `Still on the board in round ${Math.ceil(late.p.pickNumber / managers)}. Someone was paying attention.`,
    });
  }

  return awards;
}
