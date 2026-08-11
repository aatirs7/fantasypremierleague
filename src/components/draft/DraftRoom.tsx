'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Search, Star, Trash2, X } from 'lucide-react';
import PlayerPhoto from '@/components/players/PlayerPhoto';
import Avatar from '@/components/Avatar';
import RingTimer from '@/components/RingTimer';

// The draft room. Renders purely from the polled state payload so every
// device shows identical truth; the countdown renders from the server
// deadline, never a client-started timer.

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

type StateMember = {
  userId: string;
  username: string;
  isBot: boolean;
  draftOrder: number | null;
  present: boolean;
};

type SquadEntry = { fplId: number; webName: string; position: string; clubShort: string };

type DraftState = {
  stateVersion: number;
  leagueName: string;
  draftStatus: 'pending' | 'active' | 'complete';
  isTest: boolean;
  draftTime: string | null;
  ownerId: string;
  currentPick: number | null;
  round: number | null;
  totalPicks: number;
  managers: number;
  deadline: string | null;
  serverNow: string;
  currentPicker: { userId: string; username: string; isBot: boolean } | null;
  nextUp: string[];
  picks: {
    pickNumber: number;
    round: number;
    userId: string;
    username: string;
    autoPicked: boolean;
    player: SquadEntry | null;
  }[];
  members: StateMember[];
  squads: Record<string, SquadEntry[]>;
  takenIds: number[];
};

const QUOTAS: Record<string, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const POSITIONS = ['ALL', 'GK', 'DEF', 'MID', 'FWD'];

const POS_CLS: Record<string, string> = {
  GK: 'bg-gold/15 text-gold',
  DEF: 'bg-silver/15 text-silver',
  MID: 'bg-accent/15 text-accent',
  FWD: 'bg-[#38bdf8]/15 text-[#38bdf8]',
};

function QuotaDots({ squad }: { squad: SquadEntry[] }) {
  return (
    <span className="flex items-center gap-1.5">
      {Object.entries(QUOTAS).map(([pos, max]) => {
        const have = squad.filter((s) => s.position === pos).length;
        return (
          <span key={pos} className="flex items-center gap-0.5 text-[0.55rem] font-bold text-muted">
            {pos}
            {Array.from({ length: max }, (_, i) => (
              <span
                key={i}
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  i < have ? 'bg-accent' : 'bg-white/[0.12]'
                }`}
              />
            ))}
          </span>
        );
      })}
    </span>
  );
}

export default function DraftRoom({
  leagueId,
  myUserId,
  isAdmin,
}: {
  leagueId: string;
  myUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<DraftState | null>(null);
  const [pool, setPool] = useState<PoolPlayer[]>([]);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('ALL');
  const [confirm, setConfirm] = useState<PoolPlayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [introIdx, setIntroIdx] = useState(0);
  const [openChip, setOpenChip] = useState<string | null>(null);
  const [boardOpen, setBoardOpen] = useState(true);
  const [clockSkew, setClockSkew] = useState(0);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [queue, setQueue] = useState<number[]>([]);
  const wasMyTurn = useRef(false);

  // Load the full pool and my queue once; drafted players vanish via takenIds.
  useEffect(() => {
    void (async () => {
      try {
        const [pres, qres] = await Promise.all([
          fetch('/api/players/pool'),
          fetch(`/api/draft/${leagueId}/queue`),
        ]);
        if (pres.ok) {
          const data = (await pres.json()) as { players: PoolPlayer[] };
          setPool(data.players);
        }
        if (qres.ok) {
          const data = (await qres.json()) as { fplIds: number[] };
          setQueue(data.fplIds);
        }
      } catch {
        // retries on next mount; state polling continues regardless
      }
    })();
    setIntroDone(localStorage.getItem('epld_draft_intro') === 'done');
  }, [leagueId]);

  const saveQueue = (next: number[]) => {
    setQueue(next);
    void fetch(`/api/draft/${leagueId}/queue`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fplIds: next }),
    }).catch(() => {});
  };

  const toggleQueue = (fplId: number) => {
    saveQueue(queue.includes(fplId) ? queue.filter((id) => id !== fplId) : [...queue, fplId]);
  };

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/draft/${leagueId}/state`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as DraftState;
      setState(data);
      setClockSkew(new Date(data.serverNow).getTime() - Date.now());
    } catch {
      // transient network failure: next poll wins
    }
  }, [leagueId]);

  useEffect(() => {
    void poll();
    const id = setInterval(() => void poll(), 2000);
    return () => clearInterval(id);
  }, [poll]);

  // Local 200ms tick for the countdown bar.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  const myTurn = state?.draftStatus === 'active' && state.currentPicker?.userId === myUserId;

  // Vibration cue when it becomes your turn.
  useEffect(() => {
    if (myTurn && !wasMyTurn.current && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([120, 60, 120]);
    }
    wasMyTurn.current = !!myTurn;
  }, [myTurn]);

  const taken = useMemo(() => new Set(state?.takenIds ?? []), [state?.takenIds]);
  const visiblePool = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pool
      .filter((p) => !taken.has(p.fplId))
      .filter((p) => pos === 'ALL' || p.position === pos)
      .filter((p) => !needle || p.webName.toLowerCase().includes(needle))
      .slice(0, 60);
  }, [pool, taken, q, pos]);

  const mySquad = state?.squads[myUserId] ?? [];
  const myCounts = useMemo(() => {
    const c: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const s of mySquad) c[s.position]++;
    return c;
  }, [mySquad]);

  const submitPick = async (player: PoolPlayer) => {
    if (!state?.currentPick || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/draft/${leagueId}/pick`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fplId: player.fplId, pickNumber: state.currentPick }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) setError(data.error ?? 'Pick failed');
      setConfirm(null);
      await poll();
    } catch {
      setError('Network error, try again');
    }
    setBusy(false);
  };

  const startDraft = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/draft/${leagueId}/start`, { method: 'POST' });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) setError(data.error ?? 'Could not start');
      await poll();
    } catch {
      setError('Network error, try again');
    }
    setBusy(false);
  };

  const deleteTestLeague = async () => {
    if (!window.confirm('Delete this test league, its squads, picks, and bot users?')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/dev/test-draft?leagueId=${leagueId}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/home');
        router.refresh();
        return;
      }
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? 'Delete failed');
    } catch {
      setError('Network error');
    }
    setBusy(false);
  };

  if (!state) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted">
        Loading the draft room...
      </div>
    );
  }

  const testBanner = state.isTest ? (
    <div className="flex items-center justify-between rounded-xl border border-gold/30 bg-gold/[0.08] px-3 py-2">
      <span className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-gold">Test mode</span>
      {isAdmin ? (
        <button
          onClick={() => void deleteTestLeague()}
          className="flex items-center gap-1 text-xs font-bold text-live"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete test league
        </button>
      ) : null}
    </div>
  ) : null;

  const errorBanner = error ? (
    <button
      onClick={() => setError(null)}
      className="flex w-full items-center justify-between rounded-xl border border-live/40 bg-live/[0.08] px-3 py-2 text-left text-sm text-live"
    >
      {error}
      <X className="h-4 w-4 shrink-0" />
    </button>
  ) : null;

  const poolById = new Map(pool.map((p) => [p.fplId, p]));
  const queuedAvailable = queue.filter((id) => !taken.has(id) && poolById.has(id));

  // My draft plan: ordered wishlist. Timed-out picks take the top available
  // queued player first, so the plan is a safety net, not just a note.
  const queuePanel =
    queuedAvailable.length > 0 || state.draftStatus === 'pending' ? (
      <div className="card space-y-2 p-3.5">
        <p className="flex items-center justify-center gap-1.5 text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
          <Star className="h-3.5 w-3.5 text-gold" />
          My draft plan
        </p>
        {queuedAvailable.length === 0 ? (
          <p className="text-center text-xs text-muted-2">
            Tap the star on players below to queue them. If your timer runs out, we draft from
            your plan first.
          </p>
        ) : (
          queuedAvailable.map((id, i) => {
            const p = poolById.get(id)!;
            return (
              <div key={id} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-center font-display text-lg text-muted">{i + 1}</span>
                <PlayerPhoto photoCode={p.photoCode} name={p.webName} size={28} />
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {p.webName}
                  <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[0.55rem] font-bold ${POS_CLS[p.position] ?? ''}`}>
                    {p.position}
                  </span>
                </span>
                <button
                  onClick={() => {
                    const next = queuedAvailable.slice();
                    if (i > 0) [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    saveQueue(next);
                  }}
                  disabled={i === 0}
                  className="p-1.5 text-muted disabled:opacity-20"
                  aria-label="move up"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    const next = queuedAvailable.slice();
                    if (i < next.length - 1) [next[i + 1], next[i]] = [next[i], next[i + 1]];
                    saveQueue(next);
                  }}
                  disabled={i === queuedAvailable.length - 1}
                  className="p-1.5 text-muted disabled:opacity-20"
                  aria-label="move down"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  onClick={() => toggleQueue(id)}
                  className="p-1.5 text-live"
                  aria-label="remove from plan"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })
        )}
      </div>
    ) : null;

  const poolSection = (interactive: boolean) => (
    <div className="space-y-2.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search players"
          className="min-h-12 w-full rounded-full border border-edge bg-white/[0.03] pl-11 pr-4 text-sm outline-none placeholder:text-muted-2 focus:border-accent/60"
        />
      </div>
      <div className="flex gap-2">
        {POSITIONS.map((p) => {
          const full = p !== 'ALL' && myCounts[p] >= QUOTAS[p];
          return (
            <button
              key={p}
              onClick={() => setPos(p)}
              className={`min-h-9 flex-1 rounded-full border text-center text-xs font-bold transition-colors ${
                pos === p
                  ? 'border-accent bg-accent/15 text-accent'
                  : full && interactive
                    ? 'border-edge text-muted-2 opacity-50'
                    : 'border-edge bg-white/[0.02] text-muted'
              }`}
            >
              {p === 'ALL' ? 'All' : p}
            </button>
          );
        })}
      </div>
      <div className="card px-3.5">
        <div className="flex min-h-8 items-center gap-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-wider text-muted-2">
          <span className="w-5" />
          <span className="flex-1 pl-11">Player</span>
          <span className="w-10 text-center">Rank</span>
          <span className="w-9" />
        </div>
        <div className="divide-y divide-[var(--line)]">
          {visiblePool.map((p, i) => {
            const full = myCounts[p.position] >= QUOTAS[p.position];
            const starred = queue.includes(p.fplId);
            return (
              <div
                key={p.fplId}
                className={`flex min-h-14 items-center gap-3 py-2 ${interactive && full ? 'opacity-40' : ''}`}
              >
                <span className="w-5 shrink-0 text-center text-sm font-semibold text-muted-2 tabular-nums">
                  {i + 1}
                </span>
                <PlayerPhoto photoCode={p.photoCode} name={p.webName} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold">{p.webName}</span>
                    {p.status !== 'a' ? (
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${p.status === 'd' ? 'bg-gold' : 'bg-live'}`}
                      />
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {p.clubShort} <span className="text-muted-2">•</span> {p.position}
                    <span className="text-muted-2"> · {p.totalPoints} pts</span>
                  </span>
                </span>
                <span className="w-10 shrink-0 text-center text-sm font-bold tabular-nums">
                  {p.draftRank ?? '-'}
                </span>
                <span className="flex w-9 shrink-0 items-center justify-end gap-0.5">
                  {interactive && myTurn && !full ? (
                    <button
                      onClick={() => setConfirm(p)}
                      aria-label={`draft ${p.webName}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white active:scale-90"
                    >
                      <Plus className="h-4.5 w-4.5" strokeWidth={2.6} />
                    </button>
                  ) : (
                    <button
                      onClick={() => toggleQueue(p.fplId)}
                      aria-label={starred ? 'remove from plan' : 'add to plan'}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.05]"
                    >
                      <Star
                        className={`h-4 w-4 ${starred ? 'fill-[var(--gold)] text-gold' : 'text-muted-2'}`}
                      />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        {visiblePool.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No available players match.</p>
        ) : null}
      </div>
    </div>
  );

  // ------------------------------------------------------------------ lobby
  if (state.draftStatus === 'pending') {
    const here = state.members.filter((m) => m.present).length;
    const isOwner = state.ownerId === myUserId;
    const canStart = !state.draftTime || new Date(state.draftTime).getTime() <= nowTick + clockSkew;

    const intro = [
      'When it is your turn, you have 90 seconds to pick a player.',
      'You need 15 players: 2 goalkeepers, 5 defenders, 5 midfielders, 3 forwards.',
      'Miss your turn? We auto-pick the best available player for you. You will never be left behind.',
    ];

    return (
      <div className="reveal space-y-4 py-4 lg:mx-auto lg:max-w-2xl">
        {testBanner}
        <header className="pt-1 text-center">
          <h1 className="text-xl font-bold tracking-tight">Draft Room</h1>
          <p className="text-xs text-muted">{state.leagueName}</p>
        </header>

        {!introDone ? (
          <div className="card space-y-4 p-5 text-center">
            <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
              How it works ({introIdx + 1}/3)
            </p>
            <p className="flex min-h-16 items-center justify-center text-lg font-semibold">
              {intro[introIdx]}
            </p>
            <div className="flex items-center gap-2">
              {intro.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${i <= introIdx ? 'bg-accent' : 'bg-white/[0.1]'}`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  localStorage.setItem('epld_draft_intro', 'done');
                  setIntroDone(true);
                }}
                className="min-h-11 flex-1 rounded-xl border border-edge bg-white/[0.03] text-sm font-bold text-muted"
              >
                Skip
              </button>
              <button
                onClick={() => {
                  if (introIdx === 2) {
                    localStorage.setItem('epld_draft_intro', 'done');
                    setIntroDone(true);
                  } else setIntroIdx(introIdx + 1);
                }}
                className="min-h-11 flex-1 rounded-xl bg-accent text-sm font-bold text-[var(--accent-ink)]"
              >
                {introIdx === 2 ? 'Got it' : 'Next'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="card space-y-3 p-4 text-center">
          <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
            {here} of {state.members.length} here
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {state.members.map((m) => (
              <span
                key={m.userId}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  m.present ? 'border-accent/40 bg-accent/10 text-accent' : 'border-edge text-muted-2'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${m.present ? 'bg-accent' : 'bg-white/[0.15]'}`}
                />
                {m.username}
                {m.isBot ? ' 🤖' : ''}
              </span>
            ))}
          </div>
          {state.draftTime ? (
            <p className="text-center text-sm text-muted">
              Scheduled for{' '}
              {new Date(state.draftTime).toLocaleString('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          ) : null}
        </div>

        {errorBanner}

        {isOwner ? (
          <button onClick={() => void startDraft()} disabled={busy || !canStart} className="btn-primary w-full">
            {canStart ? 'Start the Draft' : 'Draft opens at the scheduled time'}
          </button>
        ) : (
          <p className="text-center text-sm text-muted">
            Waiting for the owner to start the draft. Keep this page open.
          </p>
        )}

        {/* Plan ahead while you wait. */}
        {queuePanel}
        {poolSection(false)}
      </div>
    );
  }

  // --------------------------------------------------------------- complete
  if (state.draftStatus === 'complete') {
    return (
      <div className="reveal space-y-4 py-4 lg:mx-auto lg:max-w-2xl">
        {testBanner}
        <div className="card space-y-1 p-5 text-center">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-gold">Draft complete</p>
          <h1 className="shine font-display text-5xl">All squads locked in</h1>
        </div>
        {state.members.map((m) => (
          <div key={m.userId} className="card space-y-2 p-4">
            <p className="flex items-center justify-between">
              <span className="font-bold">
                {m.username}
                {m.userId === myUserId ? (
                  <span className="ml-2 rounded-full bg-accent px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider text-[var(--accent-ink)]">
                    You
                  </span>
                ) : null}
              </span>
              <QuotaDots squad={state.squads[m.userId] ?? []} />
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(state.squads[m.userId] ?? []).map((p) => (
                <span
                  key={p.fplId}
                  className={`rounded-full px-2 py-1 text-[0.65rem] font-semibold ${POS_CLS[p.position] ?? ''}`}
                >
                  {p.webName}
                </span>
              ))}
            </div>
          </div>
        ))}
        <Link href={`/league/${leagueId}`} className="btn-primary w-full">
          Go to league home
          <ChevronRight className="h-5 w-5" />
        </Link>
      </div>
    );
  }

  // ----------------------------------------------------------------- active
  const deadlineMs = state.deadline ? new Date(state.deadline).getTime() : null;
  const serverNowMs = nowTick + clockSkew;
  const remainMs = deadlineMs != null ? Math.max(0, deadlineMs - serverNowMs) : 0;
  const pickWindowMs = state.currentPicker?.isBot ? 5000 : 90_000;
  // Pick number as Round.PickInRound, e.g. 7.01.
  const fmtPick = (pick: number) => {
    const round = Math.ceil(pick / state.managers);
    const within = ((pick - 1) % state.managers) + 1;
    return `${round}.${String(within).padStart(2, '0')}`;
  };
  const nextUpMembers = state.nextUp
    .map((name, i) => ({
      member: state.members.find((m) => m.username === name),
      pick: (state.currentPick ?? 0) + i + 1,
    }))
    .filter((x) => x.member);

  return (
    <div className="reveal space-y-4 pb-6">
      {/* Header */}
      <header className="pt-1 text-center">
        <h1 className="text-xl font-bold tracking-tight">Draft Room</h1>
        <p className="text-xs text-muted">{state.leagueName}</p>
      </header>

      {testBanner}
      {errorBanner}

      {/* Manager avatar row, draft order; tap for their roster. */}
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="mx-auto flex w-max gap-4 px-1">
          {state.members.map((m) => {
            const onClock = state.currentPicker?.userId === m.userId;
            return (
              <button
                key={m.userId}
                onClick={() => setOpenChip(openChip === m.userId ? null : m.userId)}
                className="flex w-14 flex-col items-center gap-1.5"
              >
                <Avatar name={m.username} size={44} ring={onClock} />
                <span
                  className={`w-full truncate text-center text-[0.62rem] font-semibold ${
                    onClock ? 'text-accent' : m.userId === myUserId ? 'text-foreground' : 'text-muted'
                  }`}
                >
                  {m.userId === myUserId ? 'You' : m.username}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {openChip ? (
        <div className="card space-y-2 p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold">
              {state.members.find((m) => m.userId === openChip)?.username}&apos;s roster
            </p>
            <QuotaDots squad={state.squads[openChip] ?? []} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(state.squads[openChip] ?? []).length === 0 ? (
              <span className="text-xs text-muted-2">No picks yet</span>
            ) : (
              (state.squads[openChip] ?? []).map((p) => (
                <span
                  key={p.fplId}
                  className={`rounded-full px-2 py-1 text-[0.65rem] font-semibold ${POS_CLS[p.position] ?? ''}`}
                >
                  {p.webName} · {p.clubShort}
                </span>
              ))
            )}
          </div>
        </div>
      ) : null}

      {/* The clock. */}
      {myTurn ? (
        <section className="card flex flex-col items-center gap-2 border-accent/40 p-5 text-center">
          <p className="text-base font-bold text-accent">You&apos;re on the clock!</p>
          <p className="text-sm text-muted">Pick {fmtPick(state.currentPick ?? 1)}</p>
          <RingTimer remainMs={remainMs} totalMs={pickWindowMs} size={96} />
          <p className="text-xs text-muted">Round {state.round} of 15</p>
        </section>
      ) : (
        <section className="card flex items-center gap-4 p-4">
          <Avatar name={state.currentPicker?.username ?? '?'} size={52} />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">On the Clock</p>
            <p className="truncate text-lg font-bold">{state.currentPicker?.username ?? '...'}</p>
            <p className="text-xs text-muted">
              Pick {fmtPick(state.currentPick ?? 1)} · Round {state.round} of 15
            </p>
          </div>
          <RingTimer remainMs={remainMs} totalMs={pickWindowMs} size={72} />
        </section>
      )}

      {/* Up next. */}
      {nextUpMembers.length ? (
        <div className="card flex items-center justify-center gap-8 py-3">
          <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-muted-2">
            Up Next
          </p>
          {nextUpMembers.map(({ member, pick }) => (
            <div key={pick} className="flex flex-col items-center gap-1">
              <span className="text-[0.6rem] font-semibold text-muted-2">{fmtPick(pick)}</span>
              <Avatar name={member!.username} size={34} />
              <span className="max-w-14 truncate text-[0.6rem] font-semibold text-muted">
                {member!.userId === myUserId ? 'You' : member!.username}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Draft log. */}
      <div className="card">
        <button
          onClick={() => setBoardOpen(!boardOpen)}
          className="flex w-full items-center justify-between px-4 py-3"
        >
          <span className="text-sm font-bold">Draft Log</span>
          <ChevronDown
            className={`h-4 w-4 text-muted transition-transform ${boardOpen ? '' : '-rotate-90'}`}
          />
        </button>
        {boardOpen ? (
          <div className="max-h-56 overflow-y-auto px-4 pb-2">
            {state.picks.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-2">First pick incoming...</p>
            ) : (
              state.picks.map((p) => (
                <div
                  key={p.pickNumber}
                  className="reveal flex min-h-11 items-center gap-3 border-t border-edge py-1.5 first:border-t-0"
                >
                  <Avatar name={p.username} size={30} />
                  <span className="w-16 shrink-0 truncate text-xs font-semibold text-muted">
                    {p.username}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">
                    {p.player?.webName ?? '?'}
                  </span>
                  {p.autoPicked ? (
                    <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[0.55rem] font-bold uppercase text-muted">
                      auto
                    </span>
                  ) : null}
                  <span className="shrink-0 text-xs text-muted">
                    {p.player?.clubShort} <span className="text-muted-2">•</span> {p.player?.position}
                  </span>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>

      {/* My plan + player pool. */}
      {queuePanel}
      {poolSection(true)}

      {/* Confirm sheet. */}
      {confirm ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 lg:items-center"
          onClick={() => setConfirm(null)}
        >
          <div
            className="glass reveal w-full max-w-md space-y-4 rounded-t-3xl p-5 pb-8 lg:rounded-3xl lg:pb-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
                Pick {state.currentPick}
              </p>
              <div className="mt-2 flex justify-center">
                <PlayerPhoto photoCode={confirm.photoCode} name={confirm.webName} size={96} />
              </div>
              <h2 className="mt-2 font-display text-4xl">Draft {confirm.webName}?</h2>
              <p className="mt-1 text-sm text-muted">
                {confirm.clubShort} · {confirm.position} · rank {confirm.draftRank ?? '?'} ·{' '}
                {confirm.totalPoints} pts last season
                {confirm.setPieceNotes ? ` · ${confirm.setPieceNotes}` : ''}
              </p>
            </div>
            <button onClick={() => void submitPick(confirm)} disabled={busy} className="btn-primary w-full">
              {busy ? 'Drafting...' : `Draft ${confirm.webName}`}
            </button>
            <button
              onClick={() => setConfirm(null)}
              className="min-h-11 w-full rounded-full border border-edge text-sm font-bold text-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
