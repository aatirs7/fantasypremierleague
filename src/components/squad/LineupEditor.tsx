'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Crown, Repeat, Shield } from 'lucide-react';
import PlayerPhoto from '@/components/players/PlayerPhoto';
import { applyFormation, legalFormations, XI_MAX, XI_MIN } from '@/lib/lineup-rules';
import type { LineupPick } from '@/lib/schema';

type PlayerInfo = {
  fplId: number;
  photoCode: number | null;
  webName: string;
  position: string;
  clubShort: string;
  form: string | null;
  status: string;
};

const POS_ORDER = ['GK', 'DEF', 'MID', 'FWD'];
const POS_CLS: Record<string, string> = {
  GK: 'bg-gold/15 text-gold',
  DEF: 'bg-silver/15 text-silver',
  MID: 'bg-accent/15 text-accent',
  FWD: 'bg-[#38bdf8]/15 text-[#38bdf8]',
};

// Tap-to-swap lineup setter. Tap a starter then a bench player (or vice
// versa) to swap them; captain and vice set with the C/V buttons. Saves via
// a sticky bar; the server revalidates formation and the deadline.
export default function LineupEditor({
  squadId,
  gw,
  initial,
  players,
}: {
  squadId: string;
  gw: number;
  initial: LineupPick[];
  players: PlayerInfo[];
}) {
  const router = useRouter();
  const [picks, setPicks] = useState<LineupPick[]>(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'pitch' | 'list'>('pitch');
  // Tapping a player opens their stats. Rearranging is a mode you enter on
  // purpose, so a curious tap never becomes an accidental substitution.
  const [swapMode, setSwapMode] = useState(false);
  const [pickRole, setPickRole] = useState<'captain' | 'vice' | null>(null);
  const [shapeOpen, setShapeOpen] = useState(false);

  const byId = useMemo(() => new Map(players.map((p) => [p.fplId, p])), [players]);
  const starters = picks.filter((p) => p.starting);
  const bench = picks.filter((p) => !p.starting).sort((a, b) => a.slot - b.slot);

  const counts = useMemo(() => {
    const c: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of starters) {
      const pos = byId.get(p.fplId)?.position;
      if (pos) c[pos]++;
    }
    return c;
  }, [starters, byId]);

  const formationOk = POS_ORDER.every(
    (pos) => counts[pos] >= XI_MIN[pos] && counts[pos] <= XI_MAX[pos],
  );

  const renumber = (next: LineupPick[]): LineupPick[] => {
    // Keep slots canonical: XI ordered GK/DEF/MID/FWD 1-11, bench 12-15 in
    // current bench order.
    const posOrder: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
    const xi = next
      .filter((p) => p.starting)
      .sort(
        (a, b) =>
          posOrder[byId.get(a.fplId)?.position ?? 'MID'] -
            posOrder[byId.get(b.fplId)?.position ?? 'MID'] || a.fplId - b.fplId,
      );
    const bn = next.filter((p) => !p.starting).sort((a, b) => a.slot - b.slot);
    return [
      ...xi.map((p, i) => ({ ...p, slot: i + 1 })),
      ...bn.map((p, i) => ({ ...p, slot: 12 + i, isCaptain: false, isVice: false })),
    ];
  };

  const tap = (fplId: number) => {
    setError(null);
    if (!swapMode) return;
    if (selected == null) {
      setSelected(fplId);
      return;
    }
    if (selected === fplId) {
      setSelected(null);
      return;
    }
    const a = picks.find((p) => p.fplId === selected)!;
    const b = picks.find((p) => p.fplId === fplId)!;
    if (a.starting === b.starting) {
      // Same side: treat as re-selection.
      setSelected(fplId);
      return;
    }
    const next = picks.map((p) => {
      if (p.fplId === a.fplId) return { ...p, starting: !a.starting, slot: b.slot };
      if (p.fplId === b.fplId) return { ...p, starting: !b.starting, slot: a.slot };
      return p;
    });
    setPicks(renumber(next));
    setSelected(null);
    setDirty(true);
  };

  const setShape = (target: { def: number; mid: number; fwd: number }) => {
    const positionOf = new Map(players.map((p) => [p.fplId, p.position]));
    const strengthOf = (fplId: number) => {
      const info = byId.get(fplId);
      if (!info) return 0;
      // Form decides who keeps the shirt, with an unavailable player last
      // whatever his form says.
      const base = Number(info.form ?? 0);
      return info.status === 'a' ? base + 10 : base;
    };
    setPicks(applyFormation(picks, positionOf, strengthOf, target));
    setSelected(null);
    setShapeOpen(false);
    setDirty(true);
  };

  const setRole = (fplId: number, role: 'captain' | 'vice') => {
    setPicks(
      picks.map((p) => ({
        ...p,
        isCaptain: role === 'captain' ? p.fplId === fplId : p.isCaptain && p.fplId !== fplId,
        isVice: role === 'vice' ? p.fplId === fplId : p.isVice && p.fplId !== fplId,
      })),
    );
    setDirty(true);
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/lineup', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ squadId, gw, picks: renumber(picks) }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Save failed');
      } else {
        setDirty(false);
        router.refresh();
      }
    } catch {
      setError('Network error, try again');
    }
    setBusy(false);
  };

  const Row = ({ pick }: { pick: LineupPick }) => {
    const p = byId.get(pick.fplId);
    if (!p) return null;
    const sel = selected === pick.fplId;
    return (
      <div
        className={`card flex min-h-13 items-center gap-2 px-3 py-2 ${
          sel ? 'border-accent bg-accent/[0.08]' : ''
        }`}
      >
        <button onClick={() => tap(pick.fplId)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <PlayerPhoto photoCode={p.photoCode} name={p.webName} size={34} />
          <span className={`rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold ${POS_CLS[p.position] ?? ''}`}>
            {p.position}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-bold">{p.webName}</span>
              {p.status !== 'a' ? (
                <span className={`h-1.5 w-1.5 rounded-full ${p.status === 'd' ? 'bg-gold' : 'bg-live'}`} />
              ) : null}
            </span>
            <span className="block text-[0.65rem] text-muted">
              {p.clubShort} · form {p.form ?? '0.0'}
            </span>
          </span>
        </button>
        {pick.starting ? (
          <span className="flex shrink-0 gap-1">
            <button
              onClick={() => setRole(pick.fplId, 'captain')}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-[0.65rem] font-bold ${
                pick.isCaptain ? 'bg-gold text-black' : 'bg-white/[0.05] text-muted'
              }`}
              aria-label="captain"
            >
              <Crown className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setRole(pick.fplId, 'vice')}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-[0.65rem] font-bold ${
                pick.isVice ? 'bg-silver text-black' : 'bg-white/[0.05] text-muted'
              }`}
              aria-label="vice captain"
            >
              <Shield className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : (
          <span className="shrink-0 text-[0.6rem] font-bold uppercase tracking-wider text-muted-2">
            Bench {pick.slot - 11}
          </span>
        )}
      </div>
    );
  };

  // A player plate on the pitch or bench. Outside swap mode it is a link to
  // the player's stats; inside it, a swap target.
  const Plate = ({ pick, benchIndex }: { pick: LineupPick; benchIndex?: number }) => {
    const p = byId.get(pick.fplId);
    if (!p) return null;
    const sel = selected === pick.fplId;
    const isTarget =
      swapMode &&
      selected != null &&
      selected !== pick.fplId &&
      picks.find((x) => x.fplId === selected)?.starting !== pick.starting;

    const inner = (
      <>
        {pick.isCaptain ? (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-[0.6rem] font-bold text-[var(--accent-ink)]">
            C
          </span>
        ) : pick.isVice ? (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-silver text-[0.6rem] font-bold text-[#131a24]">
            V
          </span>
        ) : null}
        {benchIndex != null ? (
          <span className="absolute -left-1 -top-1 rounded-full bg-black/50 px-1.5 text-[0.55rem] font-bold text-white/70">
            {benchIndex + 1}
          </span>
        ) : null}
        <PlayerPhoto photoCode={p.photoCode} name={p.webName} size={42} />
        <span className="w-full truncate text-center text-[0.66rem] font-semibold leading-tight text-white">
          {p.webName}
        </span>
        <span className="text-[0.55rem] font-medium text-white/55">
          {p.clubShort}
          {p.status !== 'a' ? (
            <span
              className={`ml-1 inline-block h-1.5 w-1.5 rounded-full ${p.status === 'd' ? 'bg-gold' : 'bg-live'}`}
            />
          ) : null}
        </span>
      </>
    );

    const cls = `plate relative flex ${benchIndex != null ? 'w-full' : 'w-[4.7rem]'} flex-col items-center gap-0.5 px-1 pb-1.5 pt-1.5 transition ${
      sel ? 'z-10 scale-105 ring-2 ring-[var(--accent)]' : ''
    } ${isTarget ? 'ring-1 ring-accent/50' : ''} ${swapMode && !sel && !isTarget ? 'opacity-70' : ''}`;

    return swapMode ? (
      <button onClick={() => tap(pick.fplId)} className={cls}>
        {inner}
      </button>
    ) : (
      <Link href={`/players/${pick.fplId}`} className={`${cls} active:scale-[0.97]`}>
        {inner}
      </Link>
    );
  };

  const selectedPick = selected != null ? picks.find((p) => p.fplId === selected) : null;
  const captainPick = picks.find((p) => p.isCaptain);
  const vicePick = picks.find((p) => p.isVice);

  const pitchView = (
    <div className="space-y-3">
      <div className="pitch relative space-y-4 px-2 pb-5 pt-3">
        {/* Controls sit on the grass. The pitch has dead space along the top
            edge and either side of the keeper, so nothing above it needs to
            exist. */}
        <div className="relative z-20 flex items-center justify-center gap-2">
          <button
            onClick={() => setShapeOpen(true)}
            className="rounded-full bg-black/35 px-2.5 py-1 text-[0.62rem] font-semibold text-white/80 backdrop-blur-sm"
          >
            {counts.DEF}-{counts.MID}-{counts.FWD}
          </button>
          <button
            onClick={() => {
              setSwapMode(!swapMode);
              setSelected(null);
            }}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.62rem] font-semibold backdrop-blur-sm transition ${
              swapMode ? 'bg-accent text-[var(--accent-ink)]' : 'bg-black/35 text-white/80'
            }`}
          >
            <Repeat className="h-3 w-3" />
            {swapMode ? 'Done' : 'Swap'}
          </button>
          <button
            onClick={() => setView('list')}
            className="rounded-full bg-black/35 px-2.5 py-1 text-[0.62rem] font-semibold text-white/80 backdrop-blur-sm"
          >
            List
          </button>
        </div>

        {/* Armbands flank the keeper, where the grass is empty anyway. */}
        <div className="pointer-events-none relative z-20 -mb-2 flex items-start justify-between px-1">
          <button
            onClick={() => setPickRole('captain')}
            className="pointer-events-auto flex max-w-[6.5rem] items-center gap-1 rounded-full bg-black/40 px-2 py-1 text-[0.6rem] font-semibold backdrop-blur-sm"
          >
            <Crown className="h-3 w-3 shrink-0 text-gold" />
            <span className={`truncate ${captainPick ? 'text-white/85' : 'text-live'}`}>
              {captainPick ? byId.get(captainPick.fplId)?.webName : 'Captain'}
            </span>
          </button>
          <button
            onClick={() => setPickRole('vice')}
            className="pointer-events-auto flex max-w-[6.5rem] items-center gap-1 rounded-full bg-black/40 px-2 py-1 text-[0.6rem] font-semibold backdrop-blur-sm"
          >
            <Shield className="h-3 w-3 shrink-0 text-silver" />
            <span className={`truncate ${vicePick ? 'text-white/85' : 'text-live'}`}>
              {vicePick ? byId.get(vicePick.fplId)?.webName : 'Vice'}
            </span>
          </button>
        </div>

        {POS_ORDER.map((pos) => {
          const rows = starters.filter((p) => byId.get(p.fplId)?.position === pos);
          if (!rows.length) return null;
          return (
            <div key={pos} className="relative z-10 flex justify-evenly">
              {rows.map((p) => (
                <Plate key={p.fplId} pick={p} />
              ))}
            </div>
          );
        })}
      </div>

      {swapMode && selectedPick?.starting ? (
        <div className="card flex items-center gap-2 p-2.5">
          <p className="min-w-0 flex-1 pl-1 text-xs leading-tight text-muted">
            <span className="font-semibold text-foreground">
              {byId.get(selectedPick.fplId)?.webName}
            </span>
            <span className="block text-muted-2">Tap a bench player to swap, or</span>
          </p>
          <button
            onClick={() => setRole(selectedPick.fplId, 'captain')}
            className="flex items-center gap-1 rounded-full bg-gold/15 px-3 py-1.5 text-xs font-bold text-gold"
          >
            <Crown className="h-3.5 w-3.5" /> Captain
          </button>
          <button
            onClick={() => setRole(selectedPick.fplId, 'vice')}
            className="flex items-center gap-1 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-silver"
          >
            <Shield className="h-3.5 w-3.5" /> Vice
          </button>
        </div>
      ) : null}

      <div>
        <p className="mb-1.5 text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
          Bench
          <span className="ml-1.5 font-medium normal-case tracking-normal text-muted-2">
            autosub order
          </span>
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {bench.map((p, i) => (
            <Plate key={p.fplId} pick={p} benchIndex={i} />
          ))}
        </div>
      </div>
    </div>
  );

  const listView = (
    <>
      <div className="flex items-center justify-center gap-2 pb-1">
        <button
          onClick={() => setShapeOpen(true)}
          className="rounded-full border border-edge px-2.5 py-1 text-[0.62rem] font-semibold text-muted"
        >
          {counts.DEF}-{counts.MID}-{counts.FWD}
        </button>
        <button
          onClick={() => {
            setSwapMode(!swapMode);
            setSelected(null);
          }}
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.62rem] font-semibold transition ${
            swapMode ? 'bg-accent text-[var(--accent-ink)]' : 'border border-edge text-muted'
          }`}
        >
          <Repeat className="h-3 w-3" />
          {swapMode ? 'Done' : 'Swap'}
        </button>
        <button
          onClick={() => setView('pitch')}
          className="rounded-full border border-edge px-2.5 py-1 text-[0.62rem] font-semibold text-muted"
        >
          Pitch
        </button>
      </div>
      {POS_ORDER.map((pos) => {
        const rows = starters.filter((p) => byId.get(p.fplId)?.position === pos);
        if (!rows.length) return null;
        return (
          <div key={pos} className="space-y-1.5">
            <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">{pos}</p>
            {rows.map((p) => (
              <Row key={p.fplId} pick={p} />
            ))}
          </div>
        );
      })}
      <div className="space-y-1.5">
        <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
          Bench (autosub order)
        </p>
        {bench.map((p) => (
          <Row key={p.fplId} pick={p} />
        ))}
      </div>
    </>
  );

  return (
    <div className={`space-y-3 ${dirty ? 'pb-24' : 'pb-2'}`}>
      {swapMode ? (
        <p className="rounded-xl border border-accent/35 bg-accent/[0.07] px-3 py-2 text-center text-xs text-accent">
          {selected == null
            ? 'Tap a player, then tap who they swap with.'
            : 'Now tap the player to swap them with.'}
        </p>
      ) : null}

      {shapeOpen ? (
        <div className="modal-scrim" onClick={() => setShapeOpen(false)}>
          <div className="modal-card reveal space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <p className="text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
                Defenders · Midfielders · Forwards
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">Change formation</h2>
              <p className="mt-1 text-xs text-muted">
                We keep as many of your current starters as the shape allows.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {legalFormations().map((f) => {
                const current =
                  f.def === counts.DEF && f.mid === counts.MID && f.fwd === counts.FWD;
                return (
                  <button
                    key={f.label}
                    onClick={() => setShape(f)}
                    className={`min-h-12 rounded-xl border text-sm font-semibold tabular-nums transition ${
                      current
                        ? 'border-accent bg-accent/12 text-accent'
                        : 'border-edge text-muted'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
            <button onClick={() => setShapeOpen(false)} className="btn-outline w-full">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {pickRole ? (
        <div className="modal-scrim" onClick={() => setPickRole(null)}>
          <div className="modal-card reveal space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
              {pickRole === 'captain' ? 'Scores double' : 'Doubles if your captain does not play'}
            </p>
            <h2 className="text-center text-2xl font-semibold tracking-tight">
              {pickRole === 'captain' ? 'Pick your captain' : 'Pick your vice'}
            </h2>
            <div className="divide-y divide-[var(--line)]">
              {starters.map((pick) => {
                const p = byId.get(pick.fplId);
                if (!p) return null;
                const current = pickRole === 'captain' ? pick.isCaptain : pick.isVice;
                return (
                  <button
                    key={pick.fplId}
                    onClick={() => {
                      setRole(pick.fplId, pickRole);
                      setPickRole(null);
                    }}
                    className="flex min-h-12 w-full items-center gap-2.5 py-1.5 text-left"
                  >
                    <PlayerPhoto photoCode={p.photoCode} name={p.webName} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{p.webName}</span>
                      <span className="block text-[0.65rem] text-muted">
                        {p.clubShort} · {p.position}
                      </span>
                    </span>
                    {current ? (
                      pickRole === 'captain' ? (
                        <Crown className="h-4 w-4 shrink-0 text-gold" />
                      ) : (
                        <Shield className="h-4 w-4 shrink-0 text-silver" />
                      )
                    ) : null}
                  </button>
                );
              })}
            </div>
            <button onClick={() => setPickRole(null)} className="btn-outline w-full">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {view === 'pitch' ? pitchView : listView}

      {error ? (
        <p className="rounded-xl border border-live/40 bg-live/[0.08] px-3 py-2 text-center text-sm text-live">
          {error}
        </p>
      ) : null}

      {dirty ? (
        <div className="glass sticky bottom-[calc(7.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md gap-2 rounded-full p-2 lg:bottom-6">
          <button
            onClick={() => {
              setPicks(initial);
              setDirty(false);
              setError(null);
            }}
            className="min-h-11 flex-1 rounded-full border border-edge text-sm font-bold text-muted"
          >
            Reset
          </button>
          <button
            onClick={() => void save()}
            disabled={busy || !formationOk}
            className="btn-primary min-h-11 flex-[2]"
          >
            {busy ? 'Saving...' : formationOk ? 'Save Lineup' : 'Invalid formation'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
