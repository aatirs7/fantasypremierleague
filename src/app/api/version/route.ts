import { NextResponse } from 'next/server';

// Reports the running deployment so installed PWAs can detect a new deploy
// and hard-reload themselves (see components/AutoRefresh.tsx).
export function GET() {
  return NextResponse.json({
    id:
      process.env.VERCEL_DEPLOYMENT_ID ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      'dev',
  });
}
