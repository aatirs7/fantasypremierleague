'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';

// Watchlist = the draft queue for the active pending league. Two faces of
// the same toggle: the star in the hero and the big pill at the bottom.
export default function WatchlistButton({
  leagueId,
  fplId,
  initialQueued,
  initialQueue,
  variant,
}: {
  leagueId: string;
  fplId: number;
  initialQueued: boolean;
  initialQueue: number[];
  variant: 'star' | 'pill';
}) {
  const [queued, setQueued] = useState(initialQueued);
  const [queue, setQueue] = useState(initialQueue);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const next = queued ? queue.filter((id) => id !== fplId) : [...queue, fplId];
    try {
      const res = await fetch(`/api/draft/${leagueId}/queue`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fplIds: next }),
      });
      if (res.ok) {
        setQueue(next);
        setQueued(!queued);
      }
    } catch {
      // leave state unchanged on failure
    }
    setBusy(false);
  };

  if (variant === 'star') {
    return (
      <button
        onClick={() => void toggle()}
        aria-label={queued ? 'Remove from watchlist' : 'Add to watchlist'}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05]"
      >
        <Star className={`h-5 w-5 ${queued ? 'fill-[var(--gold)] text-gold' : 'text-muted'}`} />
      </button>
    );
  }
  return (
    <button onClick={() => void toggle()} disabled={busy} className={queued ? 'btn-outline w-full' : 'btn-primary w-full'}>
      <Star className={`h-4 w-4 ${queued ? 'fill-[var(--accent)]' : ''}`} />
      {queued ? 'On your Watchlist' : 'Add to Watchlist'}
    </button>
  );
}
