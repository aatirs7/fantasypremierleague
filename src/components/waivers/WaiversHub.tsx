'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Search, X } from 'lucide-react';
import PlayerPhoto from '@/components/players/PlayerPhoto';
import LocalTime from '@/components/LocalTime';

// Waivers hub: pool with search/filters, claim queue with reorder, the
// visible priority order, and the results feed. During free agency the same
// pool executes instant pickups.

type PoolPlayer = {
  fplId: number;
  photoCode: number | null;
  webName: string;
  clubShort: string;
  position: string;
  price: string | null;
  draftRank: number | null;
  totalPoints: number;
  form: string | null;
  status: string;
  setPieceNotes: string | null;
};

type Claim = {
  id: string;
  addFplId: number;
  dropFplId: number;
  userRank: number;
  status: string;
  rejectReason: string | null;
};

type WaiversData = {
  takenIds: number[];
  lockedIds: number[];
  mySquad: { fplId: number; webName: string; position: string }[];
  window: {
    upcomingGw: number;
    deadline: string;
    closesAt: string;
    opensNow: boolean;
    freeAgencyNow: boolean;
    processed: boolean;
  } | null;
  priority: { userId: string; priority: number; username: string }[];
  myClaims: Claim[];
  results: {
    id: string;
    username: string;
    addFplId: number;
    dropFplId: number;
    status: string;
    rejectReason: string | null;
    gw: number;
  }[];
  playerNames: Record<number, { webName: string; position: string }>;
};

const POSITIONS = ['ALL', 'GK', 'DEF', 'MID', 'FWD'];
const POS_CLS: Record<string, string> = {
  GK: 'bg-gold/15 text-gold',
  DEF: 'bg-silver/15 text-silver',
  MID: 'bg-accent/15 text-accent',
  FWD: 'bg-[#38bdf8]/15 text-[#38bdf8]',
};

export default function WaiversHub({ leagueId, myUserId }: { leagueId: string; myUserId: string }) {
  const [data, setData] = useState<WaiversData | null>(null);
  const [pool, setPool] = useState<PoolPlayer[]>([]);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('ALL');
  const [adding, setAdding] = useState<PoolPlayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [wres, pres] = await Promise.all([
        fetch(`/api/waivers/${leagueId}`, { cache: 'no-store' }),
        pool.length ? null : fetch('/api/players/pool'),
      ]);
      if (wres.ok) setData((await wres.json()) as WaiversData);
      if (pres?.ok) setPool(((await pres.json()) as { players: PoolPlayer[] }).players);
    } catch {
      // next refresh wins
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, pool.length]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (payload: object) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/waivers/${leagueId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) setError(body.error ?? 'Something went wrong');
      setAdding(null);
      await load();
    } catch {
      setError('Network error, try again');
    }
    setBusy(false);
  };

  const taken = useMemo(() => new Set(data?.takenIds ?? []), [data?.takenIds]);
  const locked = useMemo(() => new Set(data?.lockedIds ?? []), [data?.lockedIds]);
  const available = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pool
      .filter((p) => !taken.has(p.fplId))
      .filter((p) => pos === 'ALL' || p.position === pos)
      .filter((p) => !needle || p.webName.toLowerCase().includes(needle))
      .slice(0, 40);
  }, [pool, taken, q, pos]);

  if (!data) {
    return <p className="py-10 text-center text-sm text-muted">Loading waivers...</p>;
  }

  const win = data.window;
  const pending = data.myClaims.filter((c) => c.status === 'pending');
  const name = (id: number) => data.playerNames[id]?.webName ?? `#${id}`;

  const reorder = (idx: number, dir: -1 | 1) => {
    const ids = pending.map((c) => c.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    void act({ action: 'reorder', claimIds: ids });
  };

  const mode = win?.freeAgencyNow ? 'free_agent' : win?.opensNow ? 'claim' : null;

  return (
    <div className="space-y-3">
      {win ? (
        <div className="card space-y-1 p-4">
          <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
            Gameweek {win.upcomingGw} window
          </p>
          {win.opensNow ? (
            <p className="text-sm">
              <span className="font-bold text-accent">Claims open.</span>{' '}
              <span className="text-muted">
                Processed <LocalTime iso={win.closesAt} mode="weekday-time" />
                , 24h before the deadline.
              </span>
            </p>
          ) : win.freeAgencyNow ? (
            <p className="text-sm">
              <span className="font-bold text-gold">Free agency.</span>{' '}
              <span className="text-muted">Claims are processed. Instant pickups until the deadline.</span>
            </p>
          ) : (
            <p className="text-sm text-muted">
              Closed. Opens once the current gameweek finishes; claims process 24h before the next
              deadline.
            </p>
          )}
        </div>
      ) : (
        <p className="card p-4 text-sm text-muted">The season is over.</p>
      )}

      {error ? (
        <button
          onClick={() => setError(null)}
          className="flex w-full items-center justify-between rounded-xl border border-live/40 bg-live/[0.08] px-3 py-2 text-left text-sm text-live"
        >
          {error} <X className="h-4 w-4 shrink-0" />
        </button>
      ) : null}

      {pending.length ? (
        <div className="card space-y-2 p-4">
          <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
            My claims (processed top first)
          </p>
          {pending.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-center font-display text-lg text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-bold text-accent">{name(c.addFplId)}</span>
                <span className="text-muted"> in, </span>
                <span className="font-bold">{name(c.dropFplId)}</span>
                <span className="text-muted"> out</span>
              </span>
              <button onClick={() => reorder(i, -1)} disabled={i === 0 || busy} className="p-1.5 text-muted disabled:opacity-20">
                <ArrowUp className="h-4 w-4" />
              </button>
              <button onClick={() => reorder(i, 1)} disabled={i === pending.length - 1 || busy} className="p-1.5 text-muted disabled:opacity-20">
                <ArrowDown className="h-4 w-4" />
              </button>
              <button onClick={() => void act({ action: 'cancel', claimId: c.id })} disabled={busy} className="p-1.5 text-live">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {mode ? (
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search the pool"
              className="min-h-12 w-full rounded-xl border border-edge bg-white/[0.03] pl-9 pr-3.5 text-sm outline-none placeholder:text-muted-2 focus:border-accent/60"
            />
          </div>
          <div className="flex gap-1.5">
            {POSITIONS.map((p) => (
              <button
                key={p}
                onClick={() => setPos(p)}
                className={`min-h-9 flex-1 rounded-full border px-2 text-xs font-bold ${
                  pos === p ? 'border-accent bg-accent/10 text-accent' : 'border-edge bg-white/[0.02] text-muted'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            {available.map((p) => {
              const isLocked = locked.has(p.fplId) && mode === 'free_agent';
              return (
                <button
                  key={p.fplId}
                  onClick={() => !isLocked && setAdding(p)}
                  disabled={isLocked}
                  className={`card flex w-full items-center gap-3 px-3 py-2.5 text-left active:scale-[0.99] ${isLocked ? 'opacity-40' : ''}`}
                >
                  <PlayerPhoto photoCode={p.photoCode} name={p.webName} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="truncate font-bold">{p.webName}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                      {p.clubShort}
                      <span className={`rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold ${POS_CLS[p.position] ?? ''}`}>
                        {p.position}
                      </span>
                      {isLocked ? <span className="text-muted-2">locked this window</span> : null}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-muted tabular-nums">
                    <span className="block text-sm font-bold text-foreground">{p.totalPoints} pts</span>
                    form {p.form ?? '0.0'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="card space-y-1.5 p-4">
        <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Waiver priority</p>
        {data.priority.map((p) => (
          <p key={p.userId} className="flex items-center gap-2 text-sm">
            <span className="w-5 text-center font-display text-lg text-muted">{p.priority}</span>
            <span className={p.userId === myUserId ? 'font-bold text-accent' : ''}>
              {p.username}
              {p.userId === myUserId ? ' (you)' : ''}
            </span>
          </p>
        ))}
        {!data.priority.length ? (
          <p className="text-xs text-muted">Priority appears after the draft.</p>
        ) : null}
      </div>

      {data.results.length ? (
        <div className="card space-y-1.5 p-4">
          <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Results</p>
          {data.results.map((r) => (
            <p key={r.id} className="text-xs">
              <span className="font-bold">{r.username}</span>{' '}
              {r.status === 'approved' ? (
                <span className="text-accent">
                  landed {name(r.addFplId)} (dropped {name(r.dropFplId)})
                </span>
              ) : (
                <span className="text-muted">
                  missed {name(r.addFplId)}: {r.rejectReason ?? 'rejected'}
                </span>
              )}
              <span className="text-muted-2"> · GW{r.gw}</span>
            </p>
          ))}
        </div>
      ) : null}

      {adding ? (
        <div className="modal-scrim" onClick={() => setAdding(null)}>
          <div
            className="modal-card reveal space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
                {mode === 'free_agent' ? 'Instant pickup' : 'Waiver claim'}
              </p>
              <h2 className="font-display text-3xl">
                {adding.webName} <span className="text-muted">in</span>
              </h2>
              <p className="mt-1 text-xs text-muted">Choose who to drop ({adding.position} for {adding.position})</p>
            </div>
            <div className="space-y-1.5">
              {data.mySquad
                .filter((s) => s.position === adding.position)
                .map((s) => (
                  <button
                    key={s.fplId}
                    disabled={busy}
                    onClick={() =>
                      void act({
                        action: mode === 'free_agent' ? 'free_agent' : 'claim',
                        addFplId: adding.fplId,
                        dropFplId: s.fplId,
                      })
                    }
                    className="card flex min-h-12 w-full items-center justify-between px-4 text-sm font-bold active:scale-[0.99]"
                  >
                    Drop {s.webName}
                    <span className={`rounded-full px-1.5 py-0.5 text-[0.6rem] ${POS_CLS[s.position] ?? ''}`}>
                      {s.position}
                    </span>
                  </button>
                ))}
            </div>
            <button onClick={() => setAdding(null)} className="min-h-11 w-full rounded-xl border border-edge text-sm font-bold text-muted">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
