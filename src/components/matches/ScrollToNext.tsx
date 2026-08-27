'use client';

import { useEffect } from 'react';

// The season list opens on the next fixture rather than at the top, so you
// are looking at what happens next and can scroll up for what already did.
// Jumps without animation: a smooth scroll through 38 gameweeks looks broken.
export default function ScrollToNext({ anchorId }: { anchorId: string }) {
  useEffect(() => {
    if (window.location.hash) return; // an explicit gameweek link wins
    const el = document.getElementById(anchorId);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top, behavior: 'auto' });
  }, [anchorId]);
  return null;
}
