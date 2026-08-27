import { and, eq, ne, type SQL } from 'drizzle-orm';
import { fplPlayers } from './schema';

// Who can still be drafted, claimed or traded for.
//
// A player who leaves the Premier League does not vanish from the FPL
// bootstrap: he keeps his row with status 'u' and news reading "Has joined
// Napoli on loan for the rest of the season". Left unfiltered he sits in the
// pool looking draftable, so every selection surface goes through this.
// `active` is the second line of defence, for rows FPL drops outright.
export const DEPARTED_STATUS = 'u';

export function draftable(): SQL {
  return and(eq(fplPlayers.active, true), ne(fplPlayers.status, DEPARTED_STATUS))!;
}

// Same rule as raw SQL, for the queries that build their own where clause
// inside a draft transaction.
export const DRAFTABLE_SQL = `fpl_players.active = true and fpl_players.status <> '${DEPARTED_STATUS}'`;
