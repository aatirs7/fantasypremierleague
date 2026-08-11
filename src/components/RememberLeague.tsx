'use client';

import { useEffect } from 'react';

// Remembers the last-viewed league so the League tab lands there.
export default function RememberLeague({ leagueId }: { leagueId: string }) {
  useEffect(() => {
    document.cookie = `epld_active_league=${leagueId}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [leagueId]);
  return null;
}
