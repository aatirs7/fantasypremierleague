'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

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
const POLL_MS = 30000;

export default function AutoRefresh({ initialBuildId }: { initialBuildId: string }) {
  const router = useRouter();
  const last = useRef(0);
  const buildId = useRef<string>(initialBuildId);

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
      if (document.visibilityState === 'visible') void refresh();
    };

    void refresh();

    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', onVisible);
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(id);
    };
  }, [router]);

  return null;
}
