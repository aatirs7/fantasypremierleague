// Should the cron wake the database this tick? Pure, no network, no DB, so it
// is unit-tested rather than discovered in a Neon bill.
//
// Neon bills from the first query until the compute suspends, and this plan
// will not suspend sooner than 300 seconds. So every tick that touches
// Postgres costs at least five minutes of compute, and the only real lever is
// how many ticks do.
//
// The first version of this gate asked FPL whether a match was still going
// using `finished`. That flag does not flip at the final whistle: it flips
// when FPL confirms bonus points, which for a Saturday match was 32 hours
// later. The gate saw nine matches "in play" for a day and a half and ran a
// full sync every five minutes all weekend, which is where 8.5 active hours a
// day came from. `finished_provisional` is the flag that means full time.

export type FixtureLite = {
  kickoff_time?: string | null;
  started?: boolean;
  finished?: boolean;
  finished_provisional?: boolean;
};

export type SyncDecision = {
  active: boolean;
  // Keep re-syncing inside this one invocation. Only while a ball is being
  // kicked; the database is awake then anyway, so extra passes are free.
  chase: boolean;
  reason: string;
};

const MIN = 60 * 1000;

// A match finishes scoring about two hours after kickoff. Bonus points then
// move for a while, so keep looking for two hours past that, at a gentle pace.
const SETTLE_UNTIL_AFTER_KICKOFF = 4 * 60 * MIN;
// One or two ticks before kickoff are enough to catch the start; the live
// window takes over the moment the match does.
const BEFORE_KICKOFF = 10 * MIN;
// The deadline nudge goes out within two hours of a deadline.
const NUDGE_WINDOW = 120 * MIN;
// FPL deadlines sit 90 minutes before a gameweek's first kickoff.
const DEADLINE_BEFORE_FIRST_KICKOFF = 90 * MIN;

// A tick landing in the first five minutes of the hour or quarter. With a
// five-minute cron exactly one tick per period qualifies, and it is decided
// from the clock alone, so no state is needed to space syncs out.
function onPeriod(now: number, periodMinutes: number): boolean {
  const d = new Date(now);
  const minutesIntoDay = d.getUTCHours() * 60 + d.getUTCMinutes();
  return minutesIntoDay % periodMinutes < 5;
}

// Four times a day, so prices, injuries and new fixtures still land during an
// international break. The previous heartbeat remembered its last run in
// memory, which a cold serverless start wipes, so every cold instance thought
// a heartbeat was overdue.
export function isHeartbeatTick(now: number): boolean {
  return onPeriod(now, 6 * 60);
}

export function decideSync(fixtures: FixtureLite[], now: number): SyncDecision {
  let live = 0;
  let soon = 0;
  let settling = 0;
  // Earliest kickoff per calendar day, as a stand-in for a gameweek's first
  // match when working out its deadline without asking the database.
  const firstKickoffs: number[] = [];

  for (const f of fixtures) {
    const kickoff = f.kickoff_time ? Date.parse(f.kickoff_time) : null;

    // In play: started and not yet at full time.
    if (f.started && !f.finished_provisional) {
      live++;
      continue;
    }
    if (kickoff == null) continue;

    if (!f.started && kickoff > now) {
      if (kickoff - now <= BEFORE_KICKOFF) soon++;
      firstKickoffs.push(kickoff);
    }

    // Full time, bonus not yet confirmed, and recent enough to still matter.
    if (f.finished_provisional && !f.finished && now - kickoff <= SETTLE_UNTIL_AFTER_KICKOFF) {
      settling++;
    }
  }

  if (live) {
    return { active: true, chase: true, reason: `${live} match${live === 1 ? '' : 'es'} in play` };
  }
  if (soon) {
    return { active: true, chase: false, reason: `${soon} kicking off in under 10 minutes` };
  }
  // Bonus moves slowly. Every 15 minutes lets the database sleep between.
  if (settling && onPeriod(now, 15)) {
    return { active: true, chase: false, reason: `${settling} finished, bonus still settling` };
  }

  // Deadline nudges: the nearest upcoming deadline, checked every 30 minutes
  // inside the two hours before it. The nudge itself only ever sends once.
  const nextKickoff = firstKickoffs.length ? Math.min(...firstKickoffs) : null;
  if (nextKickoff != null) {
    const deadline = nextKickoff - DEADLINE_BEFORE_FIRST_KICKOFF;
    const untilDeadline = deadline - now;
    if (untilDeadline > 0 && untilDeadline <= NUDGE_WINDOW && onPeriod(now, 30)) {
      return { active: true, chase: false, reason: 'deadline approaching' };
    }
  }

  if (isHeartbeatTick(now)) {
    return { active: true, chase: false, reason: 'six hourly heartbeat' };
  }
  return { active: false, chase: false, reason: 'nothing in play' };
}
