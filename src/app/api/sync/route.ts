import { NextResponse } from 'next/server';
import { runSync } from '@/lib/sync';

export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization');
  return (
    auth === `Bearer ${secret}` || auth === secret || req.headers.get('x-cron-secret') === secret
  );
}

// Manual sync trigger. ?dry=1 fetches and reports without writing anything;
// ?force=1 ignores the cadence floors.
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  try {
    const report = await runSync({
      dry: url.searchParams.get('dry') === '1',
      force: url.searchParams.get('force') === '1',
    });
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'sync failed' },
      { status: 500 },
    );
  }
}
