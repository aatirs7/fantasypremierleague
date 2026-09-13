import 'server-only';
import { fetchFixtures } from './fpl';
import { decideSync, isHeartbeatTick, type SyncDecision } from './sync-window';

// The cron's front door. Asks the FPL API, never Postgres, whether this tick
// has any work, so a quiet tick opens no database connection at all. The rules
// themselves live in sync-window.ts, where they are unit-tested.
export async function syncWindow(now = Date.now()): Promise<SyncDecision> {
  let fixtures;
  try {
    fixtures = await fetchFixtures();
  } catch {
    // FPL unreachable. Do not hammer the database every tick guessing: only
    // go ahead on a heartbeat tick, which keeps a long FPL outage from
    // silently freezing the app without turning every tick into a sync.
    return isHeartbeatTick(now)
      ? { active: true, chase: false, reason: 'fixture check failed, heartbeat sync' }
      : { active: false, chase: false, reason: 'fixture check failed, waiting for heartbeat' };
  }
  return decideSync(fixtures, now);
}

export type { SyncDecision };
