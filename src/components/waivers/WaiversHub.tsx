'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, UserPlus, X } from 'lucide-react';
import PlayerPhoto from '@/components/players/PlayerPhoto';

// Free agents. Anyone unowned can be signed on the spot, one in and one out,
// first come first served. No claim queue, no priority order, no waiting for
// a window to process overnight.

type PoolPlayer = {
  fplId: number;
  photoCode: number | null;
  webName: string;
  clubShort: string;
  position: string;
  draftRank: number | null;
  totalPoints: number;
  lastSeasonPoints?: number | null;
  form: string | null;
  status: string;
};

type MyPlayer = { fplId: number; webName: string; position: string; clubShort: string };

type Recent = {
  fplId: number;
  acquiredGw: number | null;
  username: string;
  webName: string;
  position: string;
  clubShort: string;
};

type WaiversData = {
  takenIds: number[];
  mySquad: MyPlayer[];
  window: { upcomingGw: number; deadline: string; open: boolean } | null;
  recent: Recent[];
};

const POSITIONS = ['ALL', 'GK', 'DEF', 'MID', 'FWD'];
const POS_CLS: Record<string, string> = {
  GK: 'bg-gold/15 text-gold',
  DEF: 'bg-silver/15 text-silver',
  MID: 'bg-accent/15 text-accent',
  FWD: 'bg-[#38bdf8]/15 text-[#38bdf8]',
};

export default function WaiversHub({ leagueId }: { leagueId: string; myUserId: string }) {
  const [data, setData] = useState<WaiversData | null>(null);
  const [pool, setPool] = useState<PoolPlayer[]>([]);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('ALL');
  const [adding, setAdding] = useState<PoolPlayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Ownership changes every time anyone signs, so this is reloaded after
  // every action. Kept separate from the player pool below, which is a large
  // static list: folding them together made the effect depend on state it
  // also set, and re-fire itself.
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/waivers/${leagueId}`, { cache: 'no-store' });
      if (res.ok) setData((await res.json()) as WaiversData);
    } catch {
      // the next load wins
    }
  }, [leagueId]);

  useEffect(() => {
    void load();
  }, [load]);

  // The pool of every player is fetched once and never changes within a
  // session.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/players/pool');
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { players: PoolPlayer[] };
        if (!cancelled) setPool(body.players);
      } catch {
        // leaves the list empty; a reload retries
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const taken = useMemo(() => new Set(data?.takenIds ?? []), [data]);
  const available = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pool
      .filter((p) => !taken.has(p.fplId))
      .filter((p) => pos === 'ALL' || p.position === pos)
      .filter((p) => !needle || p.webName.toLowerCase().includes(needle))
      .slice(0, 60);
  }, [pool, taken, q, pos]);

  const sign = async (dropFplId: number) => {
    if (!adding || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/waivers/${leagueId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'sign', addFplId: adding.fplId, dropFplId }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) setError(body.error ?? 'Could not complete the signing');
      else setAdding(null);
      await load();
    } catch {
      setError('Network error, try again');
    }
    setBusy(false);
  };

  if (!data) return <p className="py-10 text-center text-sm text-muted">Loading free agents...</p>;

  // Only players at the same position can be dropped, because the squad has
  // to stay 2/5/5/3 afterwards.
  const swappable = adding
    ? data.mySquad.filter((p) => p.position === adding.position)
    : [];

  return (
    <div className="space-y-3">
      {error ? (
        <button
          onClick={() => setError(null)}
          className="flex w-full items-center justify-between rounded-xl border border-live/40 bg-live/[0.08] px-3 py-2 text-left text-sm text-live"
        >
          {error} <X className="h-4 w-4 shrink-0" />
        </button>
      ) : null}

      <p className="text-center text-xs text-muted">
        Anyone unowned can be signed right now, first come first served. One in, one out, same
        position.
      </p>

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search free agents"
          className="min-h-12 w-full rounded-full border border-edge bg-white/[0.03] pl-11 pr-4 text-sm outline-none placeholder:text-muted-2 focus:border-accent/60"
        />
      </div>

      <div className="flex gap-2">
        {POSITIONS.map((p) => (
          <button
            key={p}
            onClick={() => setPos(p)}
            className={`min-h-9 flex-1 rounded-full border text-center text-xs font-semibold transition-colors ${
              pos === p ? 'border-accent bg-accent/15 text-accent' : 'border-edge text-muted'
            }`}
          >
            {p === 'ALL' ? 'All' : p}
          </button>
        ))}
      </div>

      <div className="card divide-y divide-[var(--line)] px-3.5">
        {available.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Nobody matches that.</p>
        ) : (
          available.map((p) => (
            <div key={p.fplId} className="flex min-h-14 items-center gap-3 py-2">
              <PlayerPhoto photoCode={p.photoCode} name={p.webName} size={34} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold">{p.webName}</span>
                  {p.status !== 'a' ? (
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${p.status === 'd' ? 'bg-gold' : 'bg-live'}`}
                    />
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {p.clubShort} <span className="text-muted-2">·</span> {p.position}
                  {p.lastSeasonPoints != null ? (
                    <span className="text-muted-2"> · {p.lastSeasonPoints} last szn</span>
                  ) : null}
                </span>
              </span>
              <button
                onClick={() => {
                  setAdding(p);
                  setError(null);
                }}
                aria-label={`sign ${p.webName}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-[var(--accent-ink)] active:scale-90"
              >
                <UserPlus className="h-4 w-4" strokeWidth={2.4} />
              </button>
            </div>
          ))
        )}
      </div>

      {data.recent.length ? (
        <div className="card space-y-1.5 p-4">
          <p className="text-center text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
            Recent signings
          </p>
          {data.recent.slice(0, 8).map((r, i) => (
            <p key={`${r.fplId}-${i}`} className="text-xs text-muted">
              <span className="font-semibold text-foreground">{r.username}</span> signed{' '}
              <span className="font-semibold text-foreground">{r.webName}</span>
              <span className="text-muted-2">
                {' '}
                {r.clubShort} · {r.position}
              </span>
            </p>
          ))}
        </div>
      ) : null}

      {adding ? (
        <div className="modal-scrim" onClick={() => setAdding(null)}>
          <div className="modal-card reveal space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <p className="text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
                Signing
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">{adding.webName}</h2>
              <p className="mt-1 text-xs text-muted">
                {adding.clubShort} · {adding.position}. Pick the {adding.position} he replaces.
              </p>
            </div>

            {swappable.length === 0 ? (
              <p className="text-center text-sm text-live">
                You have no {adding.position} to drop, so this swap cannot keep your squad legal.
              </p>
            ) : (
              <div className="divide-y divide-[var(--line)]">
                {swappable.map((m) => (
                  <button
                    key={m.fplId}
                    onClick={() => void sign(m.fplId)}
                    disabled={busy}
                    className="flex min-h-12 w-full items-center gap-2.5 py-2 text-left disabled:opacity-40"
                  >
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[0.55rem] font-bold ${POS_CLS[m.position] ?? ''}`}
                    >
                      {m.position}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {m.webName}
                    </span>
                    <span className="text-xs text-muted-2">{m.clubShort}</span>
                  </button>
                ))}
              </div>
            )}

            <button onClick={() => setAdding(null)} className="btn-outline w-full">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
