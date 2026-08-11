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
  (src/lib/auth.ts). No Clerk, no OAuth, no email, no PIN reset in v1.
- The scoring engine (src/lib/scoring.ts) recomputes from scratch with
  delete + insert and must stay idempotent. Same for every sync step.
- Multi-statement transactions (draft picks, waivers, trades) go through
  withTransaction in src/lib/db.ts (WebSocket driver); everything else
  uses the shared neon-http db.
- One Vercel cron only: * * * * * hitting /api/cron, self-gating inside.
- Test leagues (leagues.is_test) and bot users (users.is_bot) are excluded
  from crons and any cross-league queries.
