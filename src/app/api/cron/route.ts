import { NextResponse } from 'next/server';
import { runSync } from '@/lib/sync';

export const maxDuration = 60;

// The one cron. Vercel hits this every minute with the CRON_SECRET; the
// sections inside runSync self-gate on sync_meta floors so most ticks do
// almost nothing.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const report = await runSync();
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'sync failed' },
      { status: 500 },
    );
  }
}
