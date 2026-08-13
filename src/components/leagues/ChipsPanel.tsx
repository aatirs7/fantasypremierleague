'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

const META: Record<string, { label: string; blurb: string }> = {
  triple_captain: {
    label: 'Triple Captain',
    blurb: 'Captain scores 3x instead of 2x.',
  },
  bench_boost: {
    label: 'Bench Boost',
    blurb: 'All 15 players score, nobody benched.',
  },
  wildcard: {
    label: 'Wildcard',
    blurb: 'Every waiver claim can land in one window.',
  },
};

type Played = { chip: string; gw: number };

// One use of each chip per season. Play or take back before the deadline.
export default function ChipsPanel({ leagueId }: { leagueId: string }) {
  const [played, setPlayed] = useState<Played[]>([]);
  const [gw, setGw] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/chips/${leagueId}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { played: Played[]; editableGw: number | null };
      setPlayed(data.played);
      setGw(data.editableGw);
    } catch {
      // next render retries
    }
  }, [leagueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (chip: string, action: 'play' | 'cancel') => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/chips/${leagueId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, chip }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) setError(data.error ?? 'Could not do that');
      await load();
    } catch {
      setError('Network error, try again');
    }
    setBusy(false);
  };

  return (
    <section className="space-y-2">
      <p className="flex items-center justify-center gap-1.5 text-center text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
        <Sparkles className="h-3 w-3" />
        Chips
      </p>
      {error ? (
        <p className="rounded-xl border border-live/40 bg-live/[0.08] px-3 py-2 text-center text-xs text-live">
          {error}
        </p>
      ) : null}
      <div className="space-y-2">
        {Object.entries(META).map(([chip, meta]) => {
          const used = played.find((p) => p.chip === chip);
          const activeNow = used && gw != null && used.gw === gw;
          return (
            <div key={chip} className="tile flex items-center gap-3 p-3.5">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{meta.label}</span>
                <span className="block text-xs text-muted">
                  {activeNow
                    ? `Active for gameweek ${used!.gw}`
                    : used
                      ? `Used in gameweek ${used.gw}`
                      : meta.blurb}
                </span>
              </span>
              {activeNow ? (
                <button
                  onClick={() => void act(chip, 'cancel')}
                  disabled={busy}
                  className="shrink-0 rounded-full border border-edge px-3 py-1.5 text-xs font-semibold text-muted"
                >
                  Take back
                </button>
              ) : used ? (
                <span className="shrink-0 text-[0.6rem] font-medium uppercase tracking-wider text-muted-2">
                  Spent
                </span>
              ) : (
                <button
                  onClick={() => void act(chip, 'play')}
                  disabled={busy || gw == null}
                  className="shrink-0 rounded-full bg-[var(--btn-bg)] px-3.5 py-1.5 text-xs font-semibold text-[var(--btn-fg)] disabled:opacity-40"
                >
                  Play
                </button>
              )}
            </div>
          );
        })}
      </div>
      {gw != null ? (
        <p className="text-center text-[0.6rem] text-muted-2">
          Chips apply to gameweek {gw} and lock at the deadline.
        </p>
      ) : null}
    </section>
  );
}
