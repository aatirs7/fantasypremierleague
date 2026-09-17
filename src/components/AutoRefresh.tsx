'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { isLiveNow, type LiveWindow } from '@/lib/live-window';

// Keeps an installed (standalone) PWA fresh without a manual quit + relaunch.
// Two layers:
//  1. Data: re-fetch server components whenever the app returns to the
//     foreground, regains focus, or reconnects, plus a gentle poll while
//     visible. router.refresh preserves client state (inputs, scroll).
//  2. Code: router.refresh does NOT pull new client bundles, so after a fresh
//     deploy we poll the running deployment id and do a real reload when it
//     changes (skipped while the user is typing).
// There is no pull-to-refresh gesture anywhere in the app: this is the only
// refresh mechanism, so it polls fairly briskly while the app is visible.
//
// initialBuildId is stamped into the page by the server that rendered it
// (see layout.tsx), so it is the deployment this exact JS bundle came from.
// Without it, the first version check here would just record whatever is
// live *at that moment* as the baseline, which is already wrong if a deploy
// landed between page load and this effect running: the stale bundle would
// then call router.refresh() against a newer server and throw on the RSC
// payload mismatch, with no reload ever triggered to recover from it.
const THROTTLE_MS = 4000;
// Every server refresh re-queries Postgres, and Neon will not suspend for
// 300 seconds after the last query. At the old 30 second poll, one phone or
// tablet left open on a desk kept the database awake indefinitely, and at a
// minute it still did whenever anyone was reading the table on a weeknight.
// The only thing that changes on its own is a live score, so the poll runs
// once a minute inside the live window the server stamped into the page
// (src/lib/live-window.ts), while someone is actually using the app, and
// never otherwise. Outside it, focus, reconnect and returning to the app
// still refresh straight away, and that render brings a fresh window.
const POLL_MS = 60000;
const IDLE_AFTER_MS = 3 * 60 * 1000;

export default function AutoRefresh({
  initialBuildId,
  live,
}: {
  initialBuildId: string;
  live: LiveWindow | null;
}) {
  const router = useRouter();
  const last = useRef(0);
  const buildId = useRef<string>(initialBuildId);
  const lastActivity = useRef(0);

  useEffect(() => {
    let cancelled = false;

    // Resolves true if the deployment has moved on (and a reload was
    // triggered or is pending), false if it's still safe to call
    // router.refresh() against the current bundle.
    const checkVersion = async (): Promise<boolean> => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return false;
        const { id } = (await res.json()) as { id?: string };
        if (cancelled || !id || id === buildId.current) return false;
        const el = document.activeElement as HTMLElement | null;
        const typing =
          !!el &&
          (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
        if (typing) return true;
        window.location.reload();
        return true;
      } catch {
        // offline or blocked; not stale, just unreachable.
        return false;
      }
    };

    // Check the deployment version before touching router.refresh: a stale
    // bundle refreshing against a newer server is what throws.
    const refresh = async () => {
      const now = Date.now();
      if (now - last.current < THROTTLE_MS) return;
      last.current = now;
      const stale = await checkVersion();
      if (!stale) router.refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        lastActivity.current = Date.now();
        void refresh();
      }
    };

    // Counts as active from the moment the page mounts.
    lastActivity.current = Date.now();

    // The page was server-rendered a moment ago, so refreshing it now would
    // just run every query twice. Only confirm the bundle is current.
    void checkVersion();

    const markActive = () => {
      const wasIdle = Date.now() - lastActivity.current > IDLE_AFTER_MS;
      lastActivity.current = Date.now();
      // Coming back from idle during a match: catch up at once rather than
      // waiting a minute. Nothing has moved otherwise.
      if (wasIdle && isLiveNow(live, Date.now())) void refresh();
    };
    const activityEvents = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    for (const ev of activityEvents) {
      window.addEventListener(ev, markActive, { passive: true });
    }

    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', onVisible);
    const id = setInterval(() => {
      const now = Date.now();
      const idle = now - lastActivity.current > IDLE_AFTER_MS;
      if (document.visibilityState === 'visible' && !idle && isLiveNow(live, now)) void refresh();
    }, POLL_MS);

    return () => {
      cancelled = true;
      for (const ev of activityEvents) window.removeEventListener(ev, markActive);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(id);
    };
  }, [router, live]);

  return null;
}
