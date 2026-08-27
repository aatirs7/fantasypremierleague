'use client';

import { useEffect } from 'react';

// Marks today's fixtures, in the viewer's own timezone. The server cannot
// know what "today" is for whoever is looking, so this runs on mount and
// tags the cards; the styling itself lives in globals.css.
export default function TodayMarker() {
  useEffect(() => {
    const today = new Date().toDateString();
    for (const el of document.querySelectorAll<HTMLElement>('[data-kickoff]')) {
      const iso = el.dataset.kickoff;
      if (!iso) continue;
      if (new Date(iso).toDateString() === today) el.dataset.today = 'true';
    }
    for (const el of document.querySelectorAll<HTMLElement>('[data-day-kickoff]')) {
      const iso = el.dataset.dayKickoff;
      if (!iso) continue;
      if (new Date(iso).toDateString() === today) el.dataset.today = 'true';
    }
  }, []);
  return null;
}
