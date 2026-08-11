import 'server-only';
import { and, eq, getTableColumns, isNull, lt, sql, SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db } from './db';
import {
  fixtures,
  fplPlayers,
  gameweeks,
  gwPlayerPoints,
  loginAttempts,
  syncMeta,
} from './schema';
import {
  fetchBootstrap,
  fetchDraftBootstrap,
  fetchFixtures,
  fetchLive,
  positionName,
  setPieceNotes,
} from './fpl';

// Self-gating sync. The cron hits this every minute; each section decides
// for itself whether it is due via sync_meta floors. Every step is an
// upsert or delete+insert, so any re-run converges to identical state.

const BOOTSTRAP_FLOOR_MS = 60 * 60 * 1000; // 1h
const DRAFT_RANK_FLOOR_MS = 24 * 60 * 60 * 1000; // 24h
const FIXTURES_FLOOR_MS = 60 * 60 * 1000; // 1h idle
const FIXTURES_LIVE_FLOOR_MS = 2 * 60 * 1000; // 2min during live windows
const LIVE_FLOOR_MS = 2 * 60 * 1000; // 2min live points pull

export type SyncReport = {
  dry: boolean;
  live: boolean;
  playersUpserted: number;
  gameweeksUpserted: number;
  fixturesUpserted: number;
  livePointsUpserted: number;
  finalizedGws: number[];
  notes: string[];
};

// "excluded.<col>" update set for bulk upserts, minus the key columns.
function excludedSet(table: PgTable, skip: string[]): Record<string, SQL> {
  return Object.fromEntries(
    Object.entries(getTableColumns(table))
      .filter(([key]) => !skip.includes(key))
      .map(([key, col]) => [key, sql.raw(`excluded."${col.name}"`)]),
  );
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function getMetaMs(key: string): Promise<number> {
  const [row] = await db.select().from(syncMeta).where(eq(syncMeta.key, key)).limit(1);
  const n = row ? Number(row.value) : 0;
  return Number.isFinite(n) ? n : 0;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db
    .insert(syncMeta)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: syncMeta.key, set: { value, updatedAt: new Date() } });
}

// Any fixture underway right now. Also true shortly before kickoff so the
// first minutes are not missed (fixtures within the next 30 min).
export async function inLiveWindow(): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(fixtures)
    .where(
      sql`(${fixtures.started} = true and ${fixtures.finished} = false)
        or (${fixtures.started} = false and ${fixtures.kickoff} is not null
            and ${fixtures.kickoff} between now() and now() + interval '30 minutes')`,
    );
  return (row?.n ?? 0) > 0;
}

export async function currentGw(): Promise<number | null> {
  const [row] = await db.select().from(gameweeks).where(eq(gameweeks.isCurrent, true)).limit(1);
  return row?.gw ?? null;
}

async function syncBootstrap(report: SyncReport): Promise<void> {
  const data = await fetchBootstrap();
  if (!data.elements?.length || !data.teams?.length || !data.events?.length) {
    report.notes.push('bootstrap: missing elements/teams/events, skipped');
    return;
  }
  const typeNames = new Map(
    (data.element_types ?? [])
      .filter((t) => t.singular_name_short)
      .map((t) => [t.id, t.singular_name_short!] as const),
  );
  const teams = new Map(data.teams.map((t) => [t.id, t]));

  const playerRows = data.elements.map((el) => {
    const team = teams.get(el.team ?? -1);
    return {
      fplId: el.id,
      webName: el.web_name ?? `Player ${el.id}`,
      fullName: [el.first_name, el.second_name].filter(Boolean).join(' ') || (el.web_name ?? ''),
      clubId: el.team ?? 0,
      clubName: team?.name ?? 'Unknown',
      clubShort: team?.short_name ?? '???',
      position: positionName(el.element_type, typeNames),
      price: el.now_cost != null ? String(el.now_cost / 10) : null,
      status: el.status ?? 'a',
      news: el.news || null,
      chanceNext: el.chance_of_playing_next_round ?? null,
      totalPoints: el.total_points ?? 0,
      form: el.form ?? null,
      ppg: el.points_per_game ?? null,
      ownership: el.selected_by_percent ?? null,
      ictIndex: el.ict_index ?? null,
      ictRank: el.ict_index_rank ?? null,
      goals: el.goals_scored ?? 0,
      assists: el.assists ?? 0,
      cleanSheets: el.clean_sheets ?? 0,
      minutes: el.minutes ?? 0,
      bonus: el.bonus ?? 0,
      yellowCards: el.yellow_cards ?? 0,
      redCards: el.red_cards ?? 0,
      xg: el.expected_goals ?? null,
      xa: el.expected_assists ?? null,
      setPieceNotes: setPieceNotes(el),
      updatedAt: new Date(),
    };
  });
  for (const chunk of chunks(playerRows, 100)) {
    await db
      .insert(fplPlayers)
      .values(chunk)
      .onConflictDoUpdate({ target: fplPlayers.fplId, set: excludedSet(fplPlayers, ['fplId', 'draftRank']) });
    report.playersUpserted += chunk.length;
  }

  const gwRows = data.events
    .filter((ev) => {
      if (!ev.deadline_time) report.notes.push(`bootstrap: event ${ev.id} missing deadline_time`);
      return !!ev.deadline_time;
    })
    .map((ev) => ({
      gw: ev.id,
      name: ev.name ?? `Gameweek ${ev.id}`,
      deadline: new Date(ev.deadline_time!),
      finished: ev.finished ?? false,
      dataChecked: ev.data_checked ?? false,
      isCurrent: ev.is_current ?? false,
      isNext: ev.is_next ?? false,
      avgScore: ev.average_entry_score ?? null,
      topScore: ev.highest_score ?? null,
    }));
  if (gwRows.length) {
    await db
      .insert(gameweeks)
      .values(gwRows)
      .onConflictDoUpdate({ target: gameweeks.gw, set: excludedSet(gameweeks, ['gw', 'finalizedAt']) });
    report.gameweeksUpserted += gwRows.length;
  }
}

async function syncDraftRanks(report: SyncReport): Promise<void> {
  const data = await fetchDraftBootstrap();
  if (!data.elements?.length) {
    report.notes.push('draft api: no elements, skipped');
    return;
  }
  // The classic and draft APIs share a player universe. Assert instead of
  // assuming: sample names by id and fail loud on divergence.
  const ours = await db
    .select({ fplId: fplPlayers.fplId, webName: fplPlayers.webName })
    .from(fplPlayers);
  const ourNames = new Map(ours.map((p) => [p.fplId, p.webName]));
  let mismatches = 0;
  for (const el of data.elements.slice(0, 50)) {
    const ourName = ourNames.get(el.id);
    if (ourName && el.web_name && ourName !== el.web_name) mismatches++;
  }
  if (mismatches > 5) {
    report.notes.push(
      `draft api: ${mismatches}/50 sampled ids disagree on web_name, REFUSING draft_rank update`,
    );
    return;
  }
  const pairs = data.elements
    .filter((el) => el.draft_rank != null && ourNames.has(el.id))
    .map((el) => [el.id, el.draft_rank!] as const);
  if (pairs.length) {
    // One statement instead of one UPDATE per player. Ints only, safe inline.
    const valuesSql = pairs.map(([id, rank]) => `(${id},${rank})`).join(',');
    await db.execute(
      sql.raw(
        `update fpl_players set draft_rank = v.rank from (values ${valuesSql}) as v(id, rank) where fpl_id = v.id`,
      ),
    );
  }
  report.notes.push(`draft api: ${pairs.length} draft_ranks updated`);
}

async function syncFixtures(report: SyncReport): Promise<void> {
  const data = await fetchFixtures();
  if (!data.length) {
    report.notes.push('fixtures: empty response, skipped');
    return;
  }
  const rows = data
    .filter((f) => {
      if (f.team_h == null || f.team_a == null) {
        report.notes.push(`fixtures: fixture ${f.id} missing teams`);
        return false;
      }
      return true;
    })
    .map((f) => ({
      fplFixtureId: f.id,
      gw: f.event ?? null,
      kickoff: f.kickoff_time ? new Date(f.kickoff_time) : null,
      homeClub: f.team_h!,
      awayClub: f.team_a!,
      homeScore: f.team_h_score ?? null,
      awayScore: f.team_a_score ?? null,
      started: f.started ?? false,
      finished: (f.finished || f.finished_provisional) ?? false,
    }));
  for (const chunk of chunks(rows, 200)) {
    await db
      .insert(fixtures)
      .values(chunk)
      .onConflictDoUpdate({
        target: fixtures.fplFixtureId,
        set: excludedSet(fixtures, ['fplFixtureId']),
      });
    report.fixturesUpserted += chunk.length;
  }
}

export async function syncLivePoints(gw: number, report: SyncReport): Promise<void> {
  const data = await fetchLive(gw);
  if (!data.elements?.length) {
    report.notes.push(`live gw${gw}: empty elements, skipped`);
    return;
  }
  const rows = data.elements.map((el) => {
    const s = el.stats ?? {};
    return {
      gw,
      fplId: el.id,
      minutes: s.minutes ?? 0,
      goals: s.goals_scored ?? 0,
      assists: s.assists ?? 0,
      cleanSheet: (s.clean_sheets ?? 0) > 0,
      goalsConceded: s.goals_conceded ?? 0,
      ownGoals: s.own_goals ?? 0,
      pensSaved: s.penalties_saved ?? 0,
      pensMissed: s.penalties_missed ?? 0,
      yellow: s.yellow_cards ?? 0,
      red: s.red_cards ?? 0,
      saves: s.saves ?? 0,
      bonus: s.bonus ?? 0,
      // FPL's own number, verbatim. Never recomputed.
      totalPoints: s.total_points ?? 0,
    };
  });
  for (const chunk of chunks(rows, 200)) {
    await db
      .insert(gwPlayerPoints)
      .values(chunk)
      .onConflictDoUpdate({
        target: [gwPlayerPoints.gw, gwPlayerPoints.fplId],
        set: excludedSet(gwPlayerPoints, ['gw', 'fplId']),
      });
    report.livePointsUpserted += chunk.length;
  }
}

export async function runSync(opts: { dry?: boolean; force?: boolean } = {}): Promise<SyncReport> {
  const dry = opts.dry ?? false;
  const force = opts.force ?? false;
  const report: SyncReport = {
    dry,
    live: false,
    playersUpserted: 0,
    gameweeksUpserted: 0,
    fixturesUpserted: 0,
    livePointsUpserted: 0,
    finalizedGws: [],
    notes: [],
  };

  if (dry) {
    // Inspect what a sync would see, write nothing.
    try {
      const boot = await fetchBootstrap();
      report.notes.push(
        `dry: bootstrap ok, ${boot.elements?.length ?? 0} elements, ${boot.teams?.length ?? 0} teams, ${boot.events?.length ?? 0} events`,
      );
      const sample = boot.elements?.[0];
      if (sample) report.notes.push(`dry sample element: ${JSON.stringify(sample).slice(0, 400)}`);
      const current = boot.events?.find((e) => e.is_current) ?? boot.events?.find((e) => e.is_next);
      report.notes.push(`dry: current/next event ${current?.id} deadline ${current?.deadline_time}`);
    } catch (e) {
      report.notes.push(`dry: bootstrap FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      const draft = await fetchDraftBootstrap();
      const withRank = draft.elements?.filter((e) => e.draft_rank != null).length ?? 0;
      report.notes.push(`dry: draft api ok, ${draft.elements?.length ?? 0} elements, ${withRank} with draft_rank`);
    } catch (e) {
      report.notes.push(`dry: draft api FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      const fx = await fetchFixtures();
      report.notes.push(`dry: fixtures ok, ${fx.length} rows`);
      if (fx[0]) report.notes.push(`dry sample fixture: ${JSON.stringify(fx[0]).slice(0, 400)}`);
    } catch (e) {
      report.notes.push(`dry: fixtures FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
    return report;
  }

  const now = Date.now();
  const live = await inLiveWindow();
  report.live = live;

  // Bootstrap (players + gameweeks), 1h floor.
  if (force || now - (await getMetaMs('lastBootstrapSync')) > BOOTSTRAP_FLOOR_MS) {
    try {
      await syncBootstrap(report);
      await setMeta('lastBootstrapSync', String(now));
    } catch (e) {
      report.notes.push(`bootstrap FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Draft ranks, 24h floor.
  if (force || now - (await getMetaMs('lastDraftRankSync')) > DRAFT_RANK_FLOOR_MS) {
    try {
      await syncDraftRanks(report);
      await setMeta('lastDraftRankSync', String(now));
    } catch (e) {
      report.notes.push(`draft ranks FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Fixtures, 1h idle / 2min live floor.
  const fixturesFloor = live ? FIXTURES_LIVE_FLOOR_MS : FIXTURES_FLOOR_MS;
  if (force || now - (await getMetaMs('lastFixturesSync')) > fixturesFloor) {
    try {
      await syncFixtures(report);
      await setMeta('lastFixturesSync', String(now));
    } catch (e) {
      report.notes.push(`fixtures FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Live points pull + provisional scores, 2min floor while live.
  const gw = await currentGw();
  if (live && gw != null && (force || now - (await getMetaMs('lastLiveSync')) > LIVE_FLOOR_MS)) {
    try {
      await syncLivePoints(gw, report);
      const { rescoreGwProvisional } = await import('./scoring');
      await rescoreGwProvisional(gw, report.notes);
      await setMeta('lastLiveSync', String(now));
    } catch (e) {
      report.notes.push(`live sync FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Finalize any GW that reached data_checked but is not finalized here yet:
  // final player points, autosubs, final scores, season rollup, waivers open.
  const toFinalize = await db
    .select({ gw: gameweeks.gw })
    .from(gameweeks)
    .where(and(eq(gameweeks.dataChecked, true), isNull(gameweeks.finalizedAt)));
  for (const row of toFinalize) {
    try {
      await syncLivePoints(row.gw, report);
      const { finalizeGw } = await import('./scoring');
      await finalizeGw(row.gw, report.notes);
      await db
        .update(gameweeks)
        .set({ finalizedAt: new Date() })
        .where(eq(gameweeks.gw, row.gw));
      report.finalizedGws.push(row.gw);
    } catch (e) {
      report.notes.push(`finalize gw${row.gw} FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Housekeeping: drop login attempt rows older than an hour.
  await db.delete(loginAttempts).where(lt(loginAttempts.at, new Date(now - 60 * 60 * 1000)));

  return report;
}
