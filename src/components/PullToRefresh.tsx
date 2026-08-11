'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

// Pull-down-to-refresh for server-rendered pages: drag down from the top and
// release to re-fetch. Works in the installed (standalone) app where the
// browser's own gesture is absent.
const THRESHOLD = 70;
const MAX = 90;

export default function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [pending, startTransition] = useTransition();
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      startY.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current == null || window.scrollY > 0) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0) {
        const v = Math.min(dy * 0.5, MAX);
        pullRef.current = v;
        setPull(v);
      }
    };
    const onEnd = () => {
      if (startY.current == null) return;
      if (pullRef.current > THRESHOLD) startTransition(() => router.refresh());
      startY.current = null;
      pullRef.current = 0;
      setPull(0);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [router]);

  if (pull <= 0 && !pending) return null;
  const y = pending ? 14 : pull - 20;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center transition-transform"
      style={{ transform: `translateY(${y}px)` }}
    >
      <div className="glass flex h-9 w-9 items-center justify-center rounded-full border border-edge shadow-lg shadow-black/30">
        <RefreshCw
          className={`h-4 w-4 text-accent ${pending ? 'animate-spin' : ''}`}
          style={pending ? undefined : { transform: `rotate(${pull * 4}deg)` }}
        />
      </div>
    </div>
  );
}
