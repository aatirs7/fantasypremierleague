// When should an open tab poll for fresh scores? Pure, no network, no DB, so
// it is unit-tested rather than discovered in a Neon bill.
//
// Every router.refresh re-renders the page on the server, which queries
// Postgres, and Neon then stays awake for five minutes. A tab polling once a
// minute on a Tuesday evening therefore keeps the database up for as long as
// someone is reading the league table. The only screens that change on their
// own are live scores, so the layout stamps the current or next live window
// into the page and the poller only runs inside it.

const MIN = 60 * 1000;

// Poll from shortly before kickoff, in case the page was rendered while the
// match was still upcoming, until scoring has settled at full time.
export const BEFORE_KICKOFF = 10 * MIN;
export const AFTER_KICKOFF = 150 * MIN;

export type LiveWindow = { from: number; until: number };

// The current live window if one is open now, otherwise the next one, or null
// when nothing is scheduled. Overlapping windows (a 3pm slate) merge into one.
export function liveWindow(kickoffs: number[], now: number): LiveWindow | null {
  const sorted = kickoffs
    .filter((k) => Number.isFinite(k))
    .sort((a, b) => a - b)
    .map((k) => ({ from: k - BEFORE_KICKOFF, until: k + AFTER_KICKOFF }));

  let open: LiveWindow | null = null;
  for (const w of sorted) {
    if (open && w.from <= open.until) {
      open.until = Math.max(open.until, w.until);
      continue;
    }
    if (open && open.until > now) return open;
    open = { ...w };
  }
  return open && open.until > now ? open : null;
}

export function isLiveNow(w: LiveWindow | null, now: number): boolean {
  return !!w && now >= w.from && now < w.until;
}
