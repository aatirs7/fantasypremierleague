'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Search, Star, Trash2, X } from 'lucide-react';
import PlayerPhoto from '@/components/players/PlayerPhoto';

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
  FWD: 'bg-live/15 text-live',
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
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search players"
          className="min-h-12 w-full rounded-xl border border-edge bg-white/[0.03] pl-9 pr-3.5 text-sm outline-none placeholder:text-muted-2 focus:border-accent/60"
        />
      </div>
      <div className="flex gap-1.5">
        {POSITIONS.map((p) => {
          const full = p !== 'ALL' && myCounts[p] >= QUOTAS[p];
          return (
            <button
              key={p}
              onClick={() => setPos(p)}
              className={`min-h-9 flex-1 rounded-full border px-2 text-center text-xs font-bold ${
                pos === p
                  ? 'border-accent bg-accent/10 text-accent'
                  : full && interactive
                    ? 'border-edge text-muted-2 opacity-50'
                    : 'border-edge bg-white/[0.02] text-muted'
              }`}
            >
              {p}
              {p !== 'ALL' && interactive ? ` ${myCounts[p]}/${QUOTAS[p]}` : ''}
            </button>
          );
        })}
      </div>
      <div className="space-y-1.5">
        {visiblePool.map((p) => {
          const full = myCounts[p.position] >= QUOTAS[p.position];
          const starred = queue.includes(p.fplId);
          return (
            <div
              key={p.fplId}
              className={`card flex w-full items-center gap-3 px-3 py-2.5 ${
                interactive && full ? 'opacity-40' : ''
              }`}
            >
              <button
                onClick={() => interactive && myTurn && !full && setConfirm(p)}
                disabled={interactive && (!myTurn || full)}
                className={`flex min-w-0 flex-1 items-center gap-3 text-left ${
                  interactive && myTurn && !full ? 'active:scale-[0.99]' : ''
                }`}
              >
                <span className="w-7 shrink-0 text-center font-display text-base text-muted">
                  {p.draftRank ?? '-'}
                </span>
                <PlayerPhoto photoCode={p.photoCode} name={p.webName} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-bold">{p.webName}</span>
                    {p.status !== 'a' ? (
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${p.status === 'd' ? 'bg-gold' : 'bg-live'}`}
                      />
                    ) : null}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                    {p.clubShort}
                    <span className={`rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold ${POS_CLS[p.position] ?? ''}`}>
                      {p.position}
                    </span>
                    {p.setPieceNotes ? <span className="truncate text-muted-2">{p.setPieceNotes}</span> : null}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs text-muted tabular-nums">
                  <span className="block text-sm font-bold text-foreground">{p.totalPoints} pts</span>
                  {p.form ?? '0.0'} form
                </span>
              </button>
              <button
                onClick={() => toggleQueue(p.fplId)}
                aria-label={starred ? 'remove from plan' : 'add to plan'}
                className="shrink-0 p-1"
              >
                <Star
                  className={`h-5 w-5 ${starred ? 'fill-[var(--gold)] text-gold' : 'text-muted-2'}`}
                />
              </button>
            </div>
          );
        })}
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
        <h1 className="text-center font-display text-4xl">Draft lobby</h1>

        {!introDone ? (
          <div className="card space-y-4 p-5">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
              How it works ({introIdx + 1}/3)
            </p>
            <p className="min-h-16 text-lg font-semibold">{intro[introIdx]}</p>
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

        <div className="card space-y-3 p-4">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
            {here} of {state.members.length} here
          </p>
          <div className="flex flex-wrap gap-2">
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
            <p className="text-sm text-muted">
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
          <button
            onClick={() => void startDraft()}
            disabled={busy || !canStart}
            className="min-h-13 w-full rounded-xl bg-accent text-base font-bold text-[var(--accent-ink)] active:scale-95 disabled:opacity-30"
          >
            {canStart ? 'Start the draft' : 'Draft opens at the scheduled time'}
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
        <Link
          href={`/league/${leagueId}`}
          className="flex min-h-13 items-center justify-center rounded-xl bg-accent text-base font-bold text-[var(--accent-ink)] active:scale-95"
        >
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
  const remainPct = Math.min(100, (remainMs / pickWindowMs) * 100);
  const chipOrder = [
    ...state.members.filter((m) => m.userId === myUserId),
    ...state.members.filter((m) => m.userId !== myUserId),
  ];

  return (
    <div className="reveal space-y-3 pb-6">
      {/* Status strip, sticky and impossible to miss on your turn. */}
      <div
        className={`glass sticky top-2 z-30 space-y-2 rounded-2xl p-3 ${myTurn ? 'your-pick' : ''}`}
      >
        <div className="flex items-center justify-between text-[0.65rem] font-bold uppercase tracking-[0.2em]">
          <span className={myTurn ? '' : 'text-muted'}>
            Round {state.round} of 15 · Pick {state.currentPick} of {state.totalPicks}
          </span>
          {state.isTest ? <span className={myTurn ? '' : 'text-gold'}>Test</span> : null}
        </div>
        <p className="font-display text-3xl leading-none">
          {myTurn ? 'YOUR PICK' : `${state.currentPicker?.username ?? '...'} is picking...`}
        </p>
        <div className="h-1.5 overflow-hidden rounded-full bg-black/20">
          <div
            className={`h-full rounded-full transition-[width] duration-200 ease-linear ${
              myTurn ? 'bg-[var(--bg)]' : remainPct < 25 ? 'bg-live' : 'bg-accent'
            }`}
            style={{ width: `${remainPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className={myTurn ? '' : 'text-muted'}>
            {Math.ceil(remainMs / 1000)}s left
          </span>
          {state.nextUp.length ? (
            <span className={myTurn ? '' : 'text-muted'}>
              Then: {state.nextUp.map((n) => (n === state.members.find((m) => m.userId === myUserId)?.username ? 'You' : n)).join(', then ')}
            </span>
          ) : null}
        </div>
      </div>

      {testBanner}
      {errorBanner}

      {/* Squad tracker chips, own chip pinned first. */}
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-2">
          {chipOrder.map((m) => (
            <button
              key={m.userId}
              onClick={() => setOpenChip(openChip === m.userId ? null : m.userId)}
              className={`card flex flex-col gap-1 px-3 py-2 text-left ${
                state.currentPicker?.userId === m.userId ? 'border-gold/60' : ''
              } ${m.userId === myUserId ? 'border-accent/50' : ''}`}
            >
              <span className="text-xs font-bold">
                {m.userId === myUserId ? 'You' : m.username}
                {m.isBot ? ' 🤖' : ''}
              </span>
              <QuotaDots squad={state.squads[m.userId] ?? []} />
            </button>
          ))}
        </div>
      </div>
      {openChip ? (
        <div className="card space-y-2 p-3">
          <p className="text-xs font-bold text-muted">
            {state.members.find((m) => m.userId === openChip)?.username}&apos;s squad so far
          </p>
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

      {/* Live pick feed. */}
      <div className="card">
        <button
          onClick={() => setBoardOpen(!boardOpen)}
          className="flex w-full items-center justify-between px-3 py-2.5"
        >
          <span className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
            Pick feed
          </span>
          <ChevronDown className={`h-4 w-4 text-muted transition-transform ${boardOpen ? '' : '-rotate-90'}`} />
        </button>
        {boardOpen ? (
          <div className="max-h-48 space-y-0.5 overflow-y-auto px-3 pb-3">
            {state.picks.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-2">First pick incoming...</p>
            ) : (
              state.picks.map((p) => (
                <p key={p.pickNumber} className="reveal flex items-baseline gap-2 text-sm">
                  <span className="w-14 shrink-0 text-[0.65rem] font-bold text-muted-2">
                    Pick {p.pickNumber}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold">{p.username}</span>
                    <span className="text-muted"> drafted </span>
                    <span className="font-semibold text-accent">{p.player?.webName ?? '?'}</span>
                    <span className="text-xs text-muted">
                      {' '}({p.player?.position}, {p.player?.clubShort})
                    </span>
                  </span>
                  {p.autoPicked ? (
                    <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[0.55rem] font-bold uppercase text-muted">
                      auto
                    </span>
                  ) : null}
                </p>
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
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
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
            <button
              onClick={() => void submitPick(confirm)}
              disabled={busy}
              className="min-h-13 w-full rounded-xl bg-accent text-base font-bold text-[var(--accent-ink)] active:scale-95 disabled:opacity-40"
            >
              {busy ? 'Drafting...' : `Draft ${confirm.webName}`}
            </button>
            <button
              onClick={() => setConfirm(null)}
              className="min-h-11 w-full rounded-xl border border-edge text-sm font-bold text-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
