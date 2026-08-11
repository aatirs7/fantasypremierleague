import 'server-only';

// FPL API client. Server-side only: the API blocks browser CORS anyway, and
// our rule is that pages and clients read Neon exclusively.
//
// Reliability: FPL 503s under peak load (deadlines, season launch). Every
// fetch gets a 10s timeout and 3 retries with exponential backoff. On final
// failure callers keep serving the last-synced Neon data: a stale sync is
// fine, a crashed sync loop is not.

const CLASSIC = 'https://fantasy.premierleague.com/api';
const DRAFT = 'https://draft.premierleague.com/api';

const TIMEOUT_MS = 10_000;
const RETRIES = 3;

async function fplGet<T>(url: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
    }
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' },
      });
      if (!res.ok) throw new Error(`FPL ${res.status} for ${url}`);
      return (await res.json()) as T;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`FPL fetch failed for ${url}`);
}

// Shapes below list only the fields we read. Field names occasionally change
// between seasons, so parse defensively: unknown fields ignored, missing
// expected fields handled by the sync with loud notes.

export type BootstrapElement = {
  id: number;
  web_name?: string;
  first_name?: string;
  second_name?: string;
  team?: number;
  element_type?: number;
  now_cost?: number;
  total_points?: number;
  form?: string;
  points_per_game?: string;
  selected_by_percent?: string;
  goals_scored?: number;
  assists?: number;
  clean_sheets?: number;
  minutes?: number;
  bonus?: number;
  saves?: number;
  goals_conceded?: number;
  yellow_cards?: number;
  red_cards?: number;
  expected_goals?: string;
  expected_assists?: string;
  influence?: string;
  creativity?: string;
  threat?: string;
  ict_index?: string;
  ict_index_rank?: number;
  status?: string;
  news?: string;
  chance_of_playing_next_round?: number | null;
  corners_and_indirect_freekicks_order?: number | null;
  direct_freekicks_order?: number | null;
  penalties_order?: number | null;
};

export type BootstrapTeam = {
  id: number;
  name?: string;
  short_name?: string;
};

export type BootstrapEvent = {
  id: number;
  name?: string;
  deadline_time?: string;
  finished?: boolean;
  data_checked?: boolean;
  is_previous?: boolean;
  is_current?: boolean;
  is_next?: boolean;
  average_entry_score?: number | null;
  highest_score?: number | null;
};

export type Bootstrap = {
  elements?: BootstrapElement[];
  teams?: BootstrapTeam[];
  events?: BootstrapEvent[];
  element_types?: { id: number; singular_name_short?: string }[];
};

export type DraftBootstrap = {
  elements?: { id: number; draft_rank?: number; web_name?: string }[];
};

export type FplFixture = {
  id: number;
  event?: number | null;
  kickoff_time?: string | null;
  team_h?: number;
  team_a?: number;
  team_h_score?: number | null;
  team_a_score?: number | null;
  started?: boolean;
  finished?: boolean;
  finished_provisional?: boolean;
  minutes?: number;
};

export type LiveElement = {
  id: number;
  stats?: {
    minutes?: number;
    goals_scored?: number;
    assists?: number;
    clean_sheets?: number;
    goals_conceded?: number;
    own_goals?: number;
    penalties_saved?: number;
    penalties_missed?: number;
    yellow_cards?: number;
    red_cards?: number;
    saves?: number;
    bonus?: number;
    total_points?: number;
  };
};

export type LiveResponse = { elements?: LiveElement[] };

export type ElementSummary = {
  history?: {
    round?: number;
    total_points?: number;
    minutes?: number;
    goals_scored?: number;
    assists?: number;
    bonus?: number;
    opponent_team?: number;
    was_home?: boolean;
  }[];
  fixtures?: {
    event?: number;
    is_home?: boolean;
    team_h?: number;
    team_a?: number;
    difficulty?: number;
    kickoff_time?: string;
  }[];
};

export function fetchBootstrap(): Promise<Bootstrap> {
  return fplGet<Bootstrap>(`${CLASSIC}/bootstrap-static/`);
}

export function fetchDraftBootstrap(): Promise<DraftBootstrap> {
  return fplGet<DraftBootstrap>(`${DRAFT}/bootstrap-static`);
}

export function fetchFixtures(): Promise<FplFixture[]> {
  return fplGet<FplFixture[]>(`${CLASSIC}/fixtures/`);
}

export function fetchLive(gw: number): Promise<LiveResponse> {
  return fplGet<LiveResponse>(`${CLASSIC}/event/${gw}/live/`);
}

export function fetchElementSummary(playerId: number): Promise<ElementSummary> {
  return fplGet<ElementSummary>(`${CLASSIC}/element-summary/${playerId}/`);
}

const POSITIONS: Record<number, string> = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };

export function positionName(elementType: number | undefined, fromApi?: Map<number, string>): string {
  if (elementType == null) return 'MID';
  return fromApi?.get(elementType) ?? POSITIONS[elementType] ?? 'MID';
}

// "Corners #1 · Pens #2" style summary from the set-piece order fields.
export function setPieceNotes(el: BootstrapElement): string | null {
  const parts: string[] = [];
  if (el.corners_and_indirect_freekicks_order != null) {
    parts.push(`Corners #${el.corners_and_indirect_freekicks_order}`);
  }
  if (el.direct_freekicks_order != null) parts.push(`FKs #${el.direct_freekicks_order}`);
  if (el.penalties_order != null) parts.push(`Pens #${el.penalties_order}`);
  return parts.length ? parts.join(' · ') : null;
}
