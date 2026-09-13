<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project rules (EPL Fantasy Draft)

- No em dashes anywhere in code, copy, or comments.
- All FPL API calls (classic and draft, src/lib/fpl.ts) are server-side
  only, invoked from the sync path (/api/cron, /api/sync). Pages and
  clients read Neon exclusively.
- Never recompute FPL points from raw stats. gw_player_points.total_points
  is FPL's own number, verbatim, and already includes bonus.
- No hardcoded season dates. Gameweek deadlines come from the API mirror
  (gameweeks table).
- Auth is username + 4-digit PIN with a jose-encrypted session cookie
  (src/lib/auth.ts). No Clerk, no OAuth, no email. Login accepts a username
  or a team name (team name only when exactly one manager uses it). Lockouts
  count against the resolved account, never the text typed.
- PIN recovery without email: a logged-in manager changes their own PIN
  (needs the current one) from /me, and a league owner resets a member's
  PIN from the league page. Never reset a PIN from anywhere else.
- The scoring engine (src/lib/scoring.ts) recomputes from scratch with
  delete + insert and must stay idempotent. Same for every sync step.
- Multi-statement transactions (draft picks, waivers, trades) go through
  withTransaction in src/lib/db.ts (WebSocket driver); everything else
  uses the shared neon-http db.
- One Vercel cron only: */5 * * * * hitting /api/cron. It decides whether
  there is work from the FPL API, NOT from Postgres, so most ticks open no
  database connection. Do not go back to every minute or gate on a DB query:
  Neon bills from the first query until the compute suspends (300s minimum on
  this plan), and a per-minute cron kept the database 96% awake and took it
  over quota.
- The gate's rules live in src/lib/sync-window.ts and are unit-tested. A match
  is live while started && !finished_provisional. Never use `finished` for
  that: FPL flips it only when bonus is confirmed, up to 32 hours after full
  time, and gating on it kept the database awake 8.5 hours a day.
- The gate must stay stateless. No module variables remembering a last run:
  cold serverless starts wipe them and every cold instance then syncs.
- Client polling (AutoRefresh, LivePoller) pauses after a few idle minutes
  and never refreshes on mount. Every router.refresh re-queries Postgres.
- Test leagues (leagues.is_test) and bot users (users.is_bot) are excluded
  from crons and any cross-league queries.

<!-- BEGIN:dev-server-lifetime -->
## Dev servers: do not leave them running

Never leave a dev server, file watcher, or background task running for more
than 2 hours. Stop it when the session ends, even if you expect to return
to it shortly.

Stale watchers are the specific risk. A wedged watcher will hold one CPU
core at 100% indefinitely while total system CPU still looks low, so it does
not stand out in Task Manager. An abandoned `expo start` once held a full
core for two and a half days and kept the laptop fan running.

- Before starting a dev server, check whether one is already running for
  this project.
- When you finish, terminate the process. Do not just close the terminal.
- Do not spawn a second copy of a server that is already up.
<!-- END:dev-server-lifetime -->