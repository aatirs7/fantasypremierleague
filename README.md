# EPL Fantasy Draft

Season-long fantasy Premier League for friend groups: snake draft before kickoff, official FPL scoring every gameweek, live points during matches, waivers and trades all season.

## Stack

Next.js App Router + TypeScript, Tailwind v4 (tokens in `globals.css`), Neon Postgres + Drizzle ORM, Vercel + one self-gating Vercel cron. Mobile-first PWA, dark theme, bottom tab nav.

## Setup

```
npm install
vercel env pull .env.local   # DATABASE_URL and friends from the Vercel project
npm run db:migrate
npm run dev
```

Env vars (all set on the Vercel project): `DATABASE_URL`, `SESSION_SECRET` (32+ chars), `CRON_SECRET`, `ADMIN_USERNAMES` (comma-separated usernames allowed to use the dev test-draft endpoints).

## How data flows

- All FPL API calls (classic + draft) live in `src/lib/fpl.ts` and are invoked only from the sync path. Pages and clients read Neon exclusively.
- `/api/cron` runs every minute (Vercel cron, `Authorization: Bearer CRON_SECRET`). `src/lib/sync.ts` self-gates each section: bootstrap hourly, draft ranks daily, fixtures hourly (2 min while live), live points every 2 min during matches, GW finalization when FPL marks `data_checked`, waiver processing at window close, trade execution and expiry, login-attempt cleanup.
- `POST /api/sync?dry=1` (same secret) fetches and reports without writing; `?force=1` ignores the cadence floors.
- `gw_player_points.total_points` is FPL's own number, verbatim. Points are never recomputed from raw stats.
- Scoring (`src/lib/scoring.ts` over pure rules in `scoring-rules.ts` / `lineup-rules.ts`) recomputes from scratch and stays idempotent.
- Multi-statement transactions (draft picks, waivers, trades) use `withTransaction` in `src/lib/db.ts` (WebSocket driver) with `pg_advisory_xact_lock` per league; simple reads/writes use the shared neon-http client.

## Draft dry run

Sign in as an admin username and `POST /api/dev/test-draft {"managers":8,"bot_speed_ms":4000}` (or run `node scripts/test-draft.js` against a dev server) to rehearse a full bot draft through the real pick transaction. Delete it from the room's TEST MODE banner afterwards.

## Tests

`npm test` covers snake order math, lineup validation and auto-generation, autosubs, captain/vice doubling, and provisional scoring.

## House rules

- No em dashes anywhere in code, copy, or comments.
- No hardcoded season dates: gameweek deadlines come from the API mirror.
- One Vercel cron only; nothing always-on.
- Test leagues (`is_test`) and bot users are excluded from crons and cross-league queries.
