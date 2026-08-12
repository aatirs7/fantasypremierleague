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
const THROTTLE_MS = 4000;
const POLL_MS = 30000;

export default function AutoRefresh() {
  const router = useRouter();
  const last = useRef(0);
  const buildId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkVersion = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const { id } = (await res.json()) as { id?: string };
        if (cancelled || !id) return;
        if (buildId.current === null) {
          buildId.current = id;
          return;
        }
        if (id === buildId.current) return;
        const el = document.activeElement as HTMLElement | null;
        const typing =
          !!el &&
          (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
        if (!typing) window.location.reload();
      } catch {
        // offline or blocked; ignore
      }
    };

    const refresh = () => {
      const now = Date.now();
      if (now - last.current < THROTTLE_MS) return;
      last.current = now;
      router.refresh();
      void checkVersion();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    void checkVersion();

    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', onVisible);
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
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
