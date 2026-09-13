'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// Refreshes the server-rendered page every 30s while matches are live, but
// only while someone is looking at it. A matches page left open on a desk
// through a Sunday would otherwise keep the database awake all day for a
// screen nobody is reading. Reads Neon only, never FPL.
const POLL_MS = 30_000;
const IDLE_AFTER_MS = 3 * 60 * 1000;

export default function LivePoller() {
  const router = useRouter();
  const lastActivity = useRef(0);

  useEffect(() => {
    // Counts as active from the moment the page mounts.
    lastActivity.current = Date.now();

    const markActive = () => {
      lastActivity.current = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    for (const ev of events) window.addEventListener(ev, markActive, { passive: true });

    const id = setInterval(() => {
      const idle = Date.now() - lastActivity.current > IDLE_AFTER_MS;
      if (document.visibilityState === 'visible' && !idle) router.refresh();
    }, POLL_MS);

    return () => {
      for (const ev of events) window.removeEventListener(ev, markActive);
      clearInterval(id);
    };
  }, [router]);
  return null;
}
