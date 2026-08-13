import {
  boolean,
  char,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Conventions carried from wc26-general: no FK constraints (plain uuid/int
// columns), composite primary keys on join and derived tables so
// onConflictDoUpdate upserts stay trivial, timestamptz everywhere.

// ---------------------------------------------------------------------------
// Identity

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull(),
    // Lowercase copy for case-insensitive lookup and uniqueness.
    usernameLower: text('username_lower').notNull(),
    pinHash: text('pin_hash').notNull(),
    isBot: boolean('is_bot').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('users_username_lower_unique').on(t.usernameLower)],
);

// One row per failed or throttled login event. Counted over short windows
// for rate limiting (Vercel functions share no memory, so this lives in
// Neon); the cron deletes rows older than an hour.
export const loginAttempts = pgTable('login_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  // 'ip:<addr>' or 'user:<username_lower>'
  key: text('key').notNull(),
  at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Leagues

export const leagues = pgTable('leagues', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  joinCode: char('join_code', { length: 6 }).notNull().unique(),
  ownerId: uuid('owner_id').notNull(),
  draftTime: timestamp('draft_time', { withTimezone: true }),
  // pending | active | complete
  draftStatus: text('draft_status').notNull().default('pending'),
  vetoEnabled: boolean('veto_enabled').notNull().default(false),
  season: text('season').notNull().default('2026-27'),
  isTest: boolean('is_test').notNull().default(false),
  // Draft state machine, valid while draftStatus = active.
  // currentPick is the 1-based pick number about to be made.
  currentPick: integer('current_pick'),
  currentPickDeadline: timestamp('current_pick_deadline', { withTimezone: true }),
  // Bot pick delay for test leagues; null means the real 90s clock.
  botSpeedMs: integer('bot_speed_ms'),
  // Top-5 sampling for bot picks so repeated test drafts differ.
  botVariance: boolean('bot_variance').notNull().default(false),
  // Bumped on every draft mutation so clients can cheaply detect change.
  stateVersion: integer('state_version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const leagueMembers = pgTable(
  'league_members',
  {
    leagueId: uuid('league_id').notNull(),
    userId: uuid('user_id').notNull(),
    // Assigned (randomized) when the owner starts the draft. 1-based.
    draftOrder: integer('draft_order'),
    // Poll heartbeat for lobby presence ("6 of 8 here").
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.userId] })],
);

// ---------------------------------------------------------------------------
// FPL mirror tables. All rows come from the sync; the app never fetches FPL
// directly from a page or client.

export const fplPlayers = pgTable('fpl_players', {
  fplId: integer('fpl_id').primaryKey(),
  // FPL's stable photo/opta code; headshots live at
  // resources.premierleague.com/premierleague/photos/players/250x250/p{code}.png
  photoCode: integer('photo_code'),
  webName: text('web_name').notNull(),
  fullName: text('full_name').notNull(),
  clubId: integer('club_id').notNull(),
  // FPL's stable club code; badges live at
  // resources.premierleague.com/premierleague/badges/50/t{code}.png
  clubCode: integer('club_code'),
  clubName: text('club_name').notNull(),
  clubShort: text('club_short').notNull(),
  // GK | DEF | MID | FWD
  position: text('position').notNull(),
  price: numeric('price', { precision: 4, scale: 1 }),
  // From the Draft API; the auto-pick order. Lower is better.
  draftRank: integer('draft_rank'),
  // a available, d doubtful, i injured, s suspended, u unavailable
  status: text('status').notNull().default('a'),
  news: text('news'),
  chanceNext: integer('chance_next'),
  totalPoints: integer('total_points').notNull().default(0),
  form: numeric('form', { precision: 4, scale: 2 }),
  ppg: numeric('ppg', { precision: 4, scale: 2 }),
  ownership: numeric('ownership', { precision: 5, scale: 2 }),
  ictIndex: numeric('ict_index', { precision: 6, scale: 2 }),
  ictRank: integer('ict_rank'),
  goals: integer('goals').notNull().default(0),
  assists: integer('assists').notNull().default(0),
  cleanSheets: integer('clean_sheets').notNull().default(0),
  minutes: integer('minutes').notNull().default(0),
  bonus: integer('bonus').notNull().default(0),
  yellowCards: integer('yellow_cards').notNull().default(0),
  redCards: integer('red_cards').notNull().default(0),
  xg: numeric('xg', { precision: 6, scale: 2 }),
  xa: numeric('xa', { precision: 6, scale: 2 }),
  // Assembled from corners/freekicks/penalties order fields.
  setPieceNotes: text('set_piece_notes'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const gameweeks = pgTable('gameweeks', {
  gw: integer('gw').primaryKey(),
  name: text('name').notNull(),
  deadline: timestamp('deadline', { withTimezone: true }).notNull(),
  finished: boolean('finished').notNull().default(false),
  dataChecked: boolean('data_checked').notNull().default(false),
  isCurrent: boolean('is_current').notNull().default(false),
  isNext: boolean('is_next').notNull().default(false),
  avgScore: integer('avg_score'),
  topScore: integer('top_score'),
  // Set once our finalization pipeline has run for this GW.
  finalizedAt: timestamp('finalized_at', { withTimezone: true }),
});

export type FixtureStat = {
  identifier: string;
  a: { value: number; element: number }[];
  h: { value: number; element: number }[];
};

export const fixtures = pgTable('fixtures', {
  fplFixtureId: integer('fpl_fixture_id').primaryKey(),
  // FPL's per-fixture stat arrays (goals, assists, cards, saves, bonus),
  // stored verbatim for the match detail page.
  stats: jsonb('stats').$type<FixtureStat[]>(),
  gw: integer('gw'),
  kickoff: timestamp('kickoff', { withTimezone: true }),
  homeClub: integer('home_club').notNull(),
  awayClub: integer('away_club').notNull(),
  homeScore: integer('home_score'),
  awayScore: integer('away_score'),
  started: boolean('started').notNull().default(false),
  finished: boolean('finished').notNull().default(false),
});

// FPL's own per-player gameweek score, verbatim. total_points includes
// bonus. NEVER recompute points from raw stats.
export const gwPlayerPoints = pgTable(
  'gw_player_points',
  {
    gw: integer('gw').notNull(),
    fplId: integer('fpl_id').notNull(),
    minutes: integer('minutes').notNull().default(0),
    goals: integer('goals').notNull().default(0),
    assists: integer('assists').notNull().default(0),
    cleanSheet: boolean('clean_sheet').notNull().default(false),
    goalsConceded: integer('goals_conceded').notNull().default(0),
    ownGoals: integer('own_goals').notNull().default(0),
    pensSaved: integer('pens_saved').notNull().default(0),
    pensMissed: integer('pens_missed').notNull().default(0),
    yellow: integer('yellow').notNull().default(0),
    red: integer('red').notNull().default(0),
    saves: integer('saves').notNull().default(0),
    bonus: integer('bonus').notNull().default(0),
    totalPoints: integer('total_points').notNull(),
  },
  (t) => [primaryKey({ columns: [t.gw, t.fplId] })],
);

// ---------------------------------------------------------------------------
// Squads and the draft

export const squads = pgTable(
  'squads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leagueId: uuid('league_id').notNull(),
    userId: uuid('user_id').notNull(),
    name: text('name'),
  },
  (t) => [uniqueIndex('squads_league_user_unique').on(t.leagueId, t.userId)],
);

// One row per acquisition. dropped_gw null while on the squad. The core
// integrity rule (one owner per player per league) is a partial unique
// index added by raw SQL in the migration:
//   create unique index one_owner_per_league on squad_players (league_id, fpl_id)
//   where dropped_gw is null;
export const squadPlayers = pgTable('squad_players', {
  id: uuid('id').primaryKey().defaultRandom(),
  leagueId: uuid('league_id').notNull(),
  squadId: uuid('squad_id').notNull(),
  fplId: integer('fpl_id').notNull(),
  // draft | waiver | free_agent | trade
  acquiredVia: text('acquired_via').notNull(),
  acquiredGw: integer('acquired_gw'),
  droppedGw: integer('dropped_gw'),
});

// Pre-draft plan: each manager's private ranked wishlist. During the draft
// the room surfaces it, and a timed-out manager auto-picks their highest
// available queued player before falling back to draft_rank.
export const draftQueues = pgTable(
  'draft_queues',
  {
    leagueId: uuid('league_id').notNull(),
    userId: uuid('user_id').notNull(),
    fplId: integer('fpl_id').notNull(),
    rank: integer('rank').notNull(),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.userId, t.fplId] })],
);

export const draftPicks = pgTable(
  'draft_picks',
  {
    leagueId: uuid('league_id').notNull(),
    round: integer('round').notNull(),
    pickNumber: integer('pick_number').notNull(),
    userId: uuid('user_id').notNull(),
    fplId: integer('fpl_id').notNull(),
    autoPicked: boolean('auto_picked').notNull().default(false),
    pickedAt: timestamp('picked_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.pickNumber] })],
);

// ---------------------------------------------------------------------------
// Lineups and scores

export type LineupPick = {
  fplId: number;
  // 1-15; 12-15 are bench in priority order.
  slot: number;
  starting: boolean;
  isCaptain: boolean;
  isVice: boolean;
};

export const lineups = pgTable(
  'lineups',
  {
    squadId: uuid('squad_id').notNull(),
    gw: integer('gw').notNull(),
    picks: jsonb('picks').$type<LineupPick[]>().notNull(),
    autoSet: boolean('auto_set').notNull().default(true),
    setAt: timestamp('set_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.squadId, t.gw] })],
);

export type AutoSub = { outFplId: number; inFplId: number };

export const gwScores = pgTable(
  'gw_scores',
  {
    squadId: uuid('squad_id').notNull(),
    gw: integer('gw').notNull(),
    rawPoints: integer('raw_points').notNull().default(0),
    captainBonus: integer('captain_bonus').notNull().default(0),
    totalPoints: integer('total_points').notNull().default(0),
    autosubs: jsonb('autosubs').$type<AutoSub[]>().notNull().default([]),
    // Goals scored by the counting XI this GW, for the season tiebreak.
    goals: integer('goals').notNull().default(0),
    // false while provisional (LIVE), true once the GW is data_checked.
    final: boolean('final').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.squadId, t.gw] })],
);

export const seasonScores = pgTable('season_scores', {
  squadId: uuid('squad_id').primaryKey(),
  totalPoints: integer('total_points').notNull().default(0),
  gwsPlayed: integer('gws_played').notNull().default(0),
  // Tiebreakers, rolled up with the season total.
  gwWins: integer('gw_wins').notNull().default(0),
  squadGoals: integer('squad_goals').notNull().default(0),
});

// Daily-style baseline for labeled rank movement on the league table,
// same discipline as wc26 standing_snapshots.
export const standingSnapshots = pgTable(
  'standing_snapshots',
  {
    leagueId: uuid('league_id').notNull(),
    userId: uuid('user_id').notNull(),
    points: integer('points').notNull().default(0),
    rank: integer('rank'),
    capturedKey: text('captured_key').notNull(),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.userId] })],
);

// ---------------------------------------------------------------------------
// Head to head: a weekly opponent, then playoffs. Regular season runs to
// REGULAR_SEASON_END, semis and the final land on the last two gameweeks.

export const matchups = pgTable(
  'matchups',
  {
    leagueId: uuid('league_id').notNull(),
    gw: integer('gw').notNull(),
    // Slot distinguishes concurrent playoff ties in the same gameweek.
    slot: integer('slot').notNull().default(0),
    homeUserId: uuid('home_user_id').notNull(),
    // Null away side means a bye (odd number of managers).
    awayUserId: uuid('away_user_id'),
    homePoints: integer('home_points'),
    awayPoints: integer('away_points'),
    // regular | semi | final | third
    round: text('round').notNull().default('regular'),
    settled: boolean('settled').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.gw, t.slot] })],
);

// One row per manager per league, rolled up from settled matchups.
export const h2hRecords = pgTable(
  'h2h_records',
  {
    leagueId: uuid('league_id').notNull(),
    userId: uuid('user_id').notNull(),
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    draws: integer('draws').notNull().default(0),
    pointsFor: integer('points_for').notNull().default(0),
    pointsAgainst: integer('points_against').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.userId] })],
);

// ---------------------------------------------------------------------------
// Chips: one use each per season, played before a gameweek deadline.

export const chips = pgTable(
  'chips',
  {
    leagueId: uuid('league_id').notNull(),
    userId: uuid('user_id').notNull(),
    // triple_captain | bench_boost | wildcard
    chip: text('chip').notNull(),
    gw: integer('gw').notNull(),
    playedAt: timestamp('played_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.userId, t.chip] })],
);

// ---------------------------------------------------------------------------
// Weekly awards and league chat: the banter layer.

export const gwAwards = pgTable(
  'gw_awards',
  {
    leagueId: uuid('league_id').notNull(),
    gw: integer('gw').notNull(),
    // manager_of_week | bench_disaster | captain_curse | wooden_spoon
    kind: text('kind').notNull(),
    userId: uuid('user_id').notNull(),
    value: integer('value').notNull().default(0),
    detail: text('detail'),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.gw, t.kind] })],
);

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  leagueId: uuid('league_id').notNull(),
  // Null author means a system post (awards, trades, draft results).
  userId: uuid('user_id'),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Waivers and trades

export const waiverClaims = pgTable('waiver_claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  leagueId: uuid('league_id').notNull(),
  userId: uuid('user_id').notNull(),
  gw: integer('gw').notNull(),
  addFplId: integer('add_fpl_id').notNull(),
  dropFplId: integer('drop_fpl_id').notNull(),
  // The user's own ordering of their claims, 1 = most wanted.
  userRank: integer('user_rank').notNull(),
  // pending | approved | rejected | cancelled
  status: text('status').notNull().default('pending'),
  rejectReason: text('reject_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
});

export const waiverPriority = pgTable(
  'waiver_priority',
  {
    leagueId: uuid('league_id').notNull(),
    userId: uuid('user_id').notNull(),
    priority: integer('priority').notNull(),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.userId] })],
);

// Players dropped during a waiver window cannot be claimed until the next
// window (anti drop-and-grab). Row present = locked until that GW's window.
export const waiverLocks = pgTable(
  'waiver_locks',
  {
    leagueId: uuid('league_id').notNull(),
    fplId: integer('fpl_id').notNull(),
    untilGw: integer('until_gw').notNull(),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.fplId] })],
);

export const trades = pgTable('trades', {
  id: uuid('id').primaryKey().defaultRandom(),
  leagueId: uuid('league_id').notNull(),
  proposerId: uuid('proposer_id').notNull(),
  receiverId: uuid('receiver_id').notNull(),
  offerFplIds: integer('offer_fpl_ids').array().notNull(),
  requestFplIds: integer('request_fpl_ids').array().notNull(),
  // pending | accepted | vetoed | rejected | cancelled | expired | executed
  status: text('status').notNull().default('pending'),
  proposedAt: timestamp('proposed_at', { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  // accepted_at + 24h when the league has veto enabled.
  executesAt: timestamp('executes_at', { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Sync bookkeeping KV (lastBootstrapSync, lastDraftRankSync, lastFixturesSync,
// lastLiveSync, ...).

export const syncMeta = pgTable('sync_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
