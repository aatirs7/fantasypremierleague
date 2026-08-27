'use client';

import { useCallback, useEffect, useState } from 'react';
import { Layers, Sparkles, Zap, X, type LucideIcon } from 'lucide-react';

const META: Record<
  string,
  { label: string; short: string; blurb: string; how: string; icon: LucideIcon }
> = {
  triple_captain: {
    label: 'Triple Captain',
    short: 'TC',
    blurb: 'Captain scores 3x instead of 2x.',
    how: 'Save it for a captain with a double gameweek or a home tie against the worst defence in the league. On a 20-point haul this is 20 extra points in a single afternoon.',
    icon: Zap,
  },
  bench_boost: {
    label: 'Bench Boost',
    short: 'BB',
    blurb: 'All 15 players score, nobody benched.',
    how: 'Worth most in a week where all four of your bench players have fixtures and are fit. Check the deadline team news before you burn it.',
    icon: Layers,
  },
  wildcard: {
    label: 'Wildcard',
    short: 'WC',
    blurb: 'Every waiver claim can land in one window.',
    how: 'Normally only your top claim goes through. Play this when three or four players you want are all sitting unowned at once.',
    icon: Sparkles,
  },
};

type Played = { chip: string; gw: number };

// One use of each chip per season. Play or take back before the deadline.
export default function ChipsPanel({ leagueId }: { leagueId: string }) {
  const [played, setPlayed] = useState<Played[]>([]);
  const [gw, setGw] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

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
      {error ? (
        <p className="rounded-xl border border-live/40 bg-live/[0.08] px-3 py-2 text-center text-xs text-live">
          {error}
        </p>
      ) : null}

      {/* Three small chips that sit with the team rather than in a drawer at
          the bottom of a different page. Tap one to read what it does. */}
      <div className="flex justify-center gap-2">
        {Object.entries(META).map(([chip, meta]) => {
          const used = played.find((p) => p.chip === chip);
          const activeNow = used && gw != null && used.gw === gw;
          const Icon = meta.icon;
          return (
            <button
              key={chip}
              onClick={() => setOpen(chip)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold transition ${
                activeNow
                  ? 'border-accent bg-accent text-[var(--accent-ink)]'
                  : used
                    ? 'border-edge text-muted-2 line-through opacity-60'
                    : 'border-accent/40 bg-accent/[0.08] text-accent'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {meta.short}
            </button>
          );
        })}
      </div>

      {open ? (
        (() => {
          const meta = META[open];
          const used = played.find((p) => p.chip === open);
          const activeNow = used && gw != null && used.gw === gw;
          const Icon = meta.icon;
          return (
            <div className="modal-scrim" onClick={() => setOpen(null)}>
              <div
                className="modal-card reveal space-y-4 text-center"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative">
                  <p className="text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
                    Chip · once a season
                  </p>
                  <div className="mt-2 flex flex-col items-center gap-2">
                    <Icon className="h-7 w-7 text-accent" strokeWidth={1.6} />
                    <h2 className="text-2xl font-semibold tracking-tight">{meta.label}</h2>
                  </div>
                  <button
                    onClick={() => setOpen(null)}
                    aria-label="Close"
                    className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full border border-edge text-muted"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <p className="text-sm font-semibold">{meta.blurb}</p>
                <p className="text-sm leading-relaxed text-muted">{meta.how}</p>

                {activeNow ? (
                  <>
                    <p className="text-xs text-accent">Active for gameweek {used!.gw}.</p>
                    <button
                      onClick={() => void act(open, 'cancel')}
                      disabled={busy}
                      className="btn-outline w-full"
                    >
                      Take it back
                    </button>
                  </>
                ) : used ? (
                  <p className="text-xs text-muted-2">Spent in gameweek {used.gw}.</p>
                ) : (
                  <>
                    {gw != null ? (
                      <p className="text-xs text-muted-2">
                        Applies to gameweek {gw} and locks at the deadline.
                      </p>
                    ) : null}
                    <button
                      onClick={() => void act(open, 'play')}
                      disabled={busy || gw == null}
                      className="btn-primary w-full"
                    >
                      Play {meta.label}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })()
      ) : null}
    </section>
  );
}
