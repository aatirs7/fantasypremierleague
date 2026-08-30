import { NextResponse } from 'next/server';
import { runSync } from '@/lib/sync';
import { syncWindow } from '@/lib/should-sync';

export const maxDuration = 60;

// The one cron. Vercel hits this every 5 minutes.
//
// Most ticks do nothing and, crucially, touch no database. Neon bills from
// the first query until the compute suspends, so a tick that opens a
// connection just to discover there is no work still costs five minutes of
// compute. Deciding from the FPL API instead keeps Postgres asleep for days
// between match rounds.
//
// When something IS happening the invocation stays alive and re-syncs every
// 20 seconds within its own budget. The database is already awake by then,
// so those extra passes are close to free and live scores move in near real
// time rather than in five minute steps.
const LIVE_PASS_MS = 20_000;
const BUDGET_MS = 45_000;

// Survives between invocations on a warm instance. Only an optimisation: a
// cold start just means one extra heartbeat sync.
let lastRunMs = 0;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  try {
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === '1';
    const window = force
      ? { active: true, reason: 'forced' }
      : await syncWindow(lastRunMs, started);

    if (!window.active) {
      return NextResponse.json({ skipped: true, reason: window.reason });
    }

    lastRunMs = started;
    const reports = [await runSync()];

    // Stay on the clock while matches are in play.
    const chase = window.reason.includes('in play');
    while (chase && Date.now() - started + LIVE_PASS_MS < BUDGET_MS) {
      await new Promise((r) => setTimeout(r, LIVE_PASS_MS));
      reports.push(await runSync());
    }

    return NextResponse.json({
      reason: window.reason,
      passes: reports.length,
      report: reports[reports.length - 1],
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'sync failed' },
      { status: 500 },
    );
  }
}
