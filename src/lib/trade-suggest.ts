// Trade suggestions. Pure, no DB, fully unit-testable.
//
// A draft league fixes every squad at 2/5/5/3 and the engine rejects any
// trade that would break that, so a legal deal must swap like for like by
// position. A straight 1-for-1 is therefore only ever "who is better", which
// nobody accepts.
//
// The trade that does get accepted is the 2-for-2 rebalance: I have two
// elite midfielders and a passenger up front, you have the mirror image, so
// we swap a strong MID for a strong FWD and even the two benches out. Both
// position counts survive, and both sides upgrade where they are thin.

export type SuggestPlayer = {
  fplId: number;
  webName: string;
  position: string;
  clubShort: string;
  lastSeasonPoints: number | null;
  draftRank: number | null;
  totalPoints: number;
};

export type Suggestion = {
  partnerId: string;
  partnerName: string;
  // What leaves your squad, and what arrives.
  give: SuggestPlayer[];
  get: SuggestPlayer[];
  // Projected points swing for each side over a season. Positive is a gain.
  yourGain: number;
  theirGain: number;
  reason: string;
};

// How many of each position actually start, which is what makes a player
// surplus rather than a starter.
const STARTERS: Record<string, number> = { GK: 1, DEF: 4, MID: 4, FWD: 2 };
const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];

// One number for how good a player is. Last season's points are the honest
// signal; a player with no Premier League history falls back to his draft
// rank, which is FPL's own projection.
export function value(p: SuggestPlayer): number {
  if (p.lastSeasonPoints != null) return p.lastSeasonPoints;
  if (p.draftRank != null) return Math.max(0, 200 - p.draftRank);
  return p.totalPoints;
}

function byValue(players: SuggestPlayer[], position: string): SuggestPlayer[] {
  return players.filter((p) => p.position === position).sort((a, b) => value(b) - value(a));
}

// Strength at a position is what your starters there are worth; depth is
// what is sitting behind them.
function strength(players: SuggestPlayer[], position: string): number {
  const ranked = byValue(players, position);
  const n = STARTERS[position] ?? 1;
  return ranked.slice(0, n).reduce((sum, p) => sum + value(p), 0);
}

export function suggestTrades(
  mine: SuggestPlayer[],
  partners: { userId: string; username: string; players: SuggestPlayer[] }[],
  limit = 4,
): Suggestion[] {
  const out: Suggestion[] = [];

  for (const partner of partners) {
    for (const posA of POSITIONS) {
      for (const posB of POSITIONS) {
        if (posA === posB) continue;

        // I am deep at A and thin at B; they are the other way round.
        const myA = byValue(mine, posA);
        const myB = byValue(mine, posB);
        const theirA = byValue(partner.players, posA);
        const theirB = byValue(partner.players, posB);
        if (!myA.length || !myB.length || !theirA.length || !theirB.length) continue;

        // What I can afford to lose at A: my best surplus, the man just
        // outside my starting group. Losing him costs me nothing today.
        const surplusIndex = STARTERS[posA] ?? 1;
        const myGive = myA[surplusIndex] ?? myA[myA.length - 1];
        // What I want at B: their best surplus, for the same reason.
        const theirSurplusIndex = STARTERS[posB] ?? 1;
        const theirGive = theirB[theirSurplusIndex] ?? theirB[theirB.length - 1];
        if (!myGive || !theirGive) continue;

        // The balancing halves: my weakest B and their weakest A, the two
        // players neither squad wants. Swapping them keeps the counts legal.
        const myFiller = myB[myB.length - 1];
        const theirFiller = theirA[theirA.length - 1];
        if (!myFiller || !theirFiller) continue;
        if (myGive.fplId === myFiller.fplId || theirGive.fplId === theirFiller.fplId) continue;

        const give = [myGive, myFiller];
        const get = [theirGive, theirFiller];

        // Score it by what each starting XI is worth before and after.
        const myAfter = mine
          .filter((p) => !give.some((g) => g.fplId === p.fplId))
          .concat(get);
        const theirAfter = partner.players
          .filter((p) => !get.some((g) => g.fplId === p.fplId))
          .concat(give);

        const yourGain =
          POSITIONS.reduce((s, pos) => s + strength(myAfter, pos), 0) -
          POSITIONS.reduce((s, pos) => s + strength(mine, pos), 0);
        const theirGain =
          POSITIONS.reduce((s, pos) => s + strength(theirAfter, pos), 0) -
          POSITIONS.reduce((s, pos) => s + strength(partner.players, pos), 0);

        // Only worth showing if it is worth both managers' time. A deal that
        // only helps you is one they will reject.
        if (yourGain <= 5 || theirGain <= 5) continue;

        out.push({
          partnerId: partner.userId,
          partnerName: partner.username,
          give,
          get,
          yourGain: Math.round(yourGain),
          theirGain: Math.round(theirGain),
          reason: `You are deep at ${posA} and thin at ${posB}. ${partner.username} is the other way round.`,
        });
      }
    }
  }

  // Best mutual deals first, and never two suggestions built on the same
  // player leaving your squad.
  const seen = new Set<number>();
  return out
    .sort((a, b) => b.yourGain + b.theirGain - (a.yourGain + a.theirGain))
    .filter((s) => {
      const key = s.give[0].fplId;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
