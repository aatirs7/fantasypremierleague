import { NextResponse } from 'next/server';
import { runSync } from '@/lib/sync';
import { syncWindow } from '@/lib/should-sync';

export const maxDuration = 60;

// The one cron. Vercel hits this every 5 minutes.
//
// Most ticks do nothing and, crucially, touch no database. Neon bills from
// the first query until the compute suspends, and this plan will not suspend
// sooner than 300 seconds, so a tick that opens a connection just to discover
// there is no work still costs five minutes of compute. The decision comes
// from the FPL API (src/lib/sync-window.ts, unit-tested) instead.
//
// The gate is stateless on purpose. An earlier version remembered its last
// run in a module variable, and every cold serverless start reset it to zero,
// so a cold instance always believed its heartbeat was overdue and synced.
//
// While a ball is actually being kicked the invocation stays alive and
// re-syncs every 20 seconds within its own budget. The database is awake by
// then anyway, so those passes cost nothing extra and live scores move in
// near real time.
const LIVE_PASS_MS = 20_000;
const BUDGET_MS = 45_000;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  try {
    const force = new URL(req.url).searchParams.get('force') === '1';
    const decision = force
      ? { active: true, chase: false, reason: 'forced' }
      : await syncWindow(started);

    if (!decision.active) {
      return NextResponse.json({ skipped: true, reason: decision.reason });
    }

    const reports = [await runSync()];
    while (decision.chase && Date.now() - started + LIVE_PASS_MS < BUDGET_MS) {
      await new Promise((r) => setTimeout(r, LIVE_PASS_MS));
      reports.push(await runSync());
    }

    return NextResponse.json({
      reason: decision.reason,
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
