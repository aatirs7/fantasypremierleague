import 'server-only';
import { fetchFixtures } from './fpl';

// Should the cron do anything at all this tick?
//
// This deliberately answers using the FPL API only, never Postgres. Neon
// bills from the first query until the compute suspends, so a cron that
// touches the database every few minutes keeps it awake around the clock
// whether or not there was any work to do. That is what took this app's
// database to 96% awake and over its quota.
//
// Football is idle most of the week. By asking a free external API whether a
// match is in play, the database stays asleep for days at a time and only
// wakes when a score can actually change.

export type SyncWindow = {
  active: boolean;
  reason: string;
};

// Bonus points keep moving for a while after full time, so a finished match
// stays interesting until FPL has settled it.
const AFTER_FULL_TIME_MS = 3 * 60 * 60 * 1000;
// Wake up before kickoff so the opening minutes are never missed.
const BEFORE_KICKOFF_MS = 30 * 60 * 1000;
// A daily heartbeat, so player prices, injuries and new fixtures still land
// during an international break when nothing is being played.
const HEARTBEAT_MS = 12 * 60 * 60 * 1000;

export async function syncWindow(lastRunMs: number, now = Date.now()): Promise<SyncWindow> {
  if (now - lastRunMs > HEARTBEAT_MS) {
    return { active: true, reason: 'daily heartbeat' };
  }

  let fixtures;
  try {
    fixtures = await fetchFixtures();
  } catch {
    // If FPL is unreachable we cannot tell, so err towards doing the work
    // rather than silently freezing every score in the app.
    return { active: true, reason: 'fixture check failed, syncing anyway' };
  }

  let live = 0;
  let soon = 0;
  let justFinished = 0;
  for (const f of fixtures) {
    const kickoff = f.kickoff_time ? Date.parse(f.kickoff_time) : null;
    if (f.started && !f.finished) {
      live++;
      continue;
    }
    if (kickoff == null) continue;
    if (!f.started && kickoff > now && kickoff - now <= BEFORE_KICKOFF_MS) soon++;
    if (f.finished && now - kickoff <= AFTER_FULL_TIME_MS) justFinished++;
  }

  if (live) return { active: true, reason: `${live} match${live === 1 ? '' : 'es'} in play` };
  if (soon) return { active: true, reason: `${soon} kicking off within the half hour` };
  if (justFinished) {
    return { active: true, reason: `${justFinished} just finished, bonus still settling` };
  }
  return { active: false, reason: 'nothing in play' };
}
