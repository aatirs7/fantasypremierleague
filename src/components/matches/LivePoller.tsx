'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Refreshes the server-rendered page every 30s while matches are live.
// Reads Neon only, never FPL.
export default function LivePoller() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
