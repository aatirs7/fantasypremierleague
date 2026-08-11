'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Crown, Shield } from 'lucide-react';
import PlayerPhoto from '@/components/players/PlayerPhoto';
import { XI_MAX, XI_MIN } from '@/lib/lineup-rules';
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
  autoSet,
}: {
  squadId: string;
  gw: number;
  initial: LineupPick[];
  players: PlayerInfo[];
  autoSet: boolean;
}) {
  const router = useRouter();
  const [picks, setPicks] = useState<LineupPick[]>(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'pitch' | 'list'>('pitch');

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

  // A player plate on the pitch or bench.
  const Plate = ({ pick, benchIndex }: { pick: LineupPick; benchIndex?: number }) => {
    const p = byId.get(pick.fplId);
    if (!p) return null;
    const sel = selected === pick.fplId;
    return (
      <button
        onClick={() => tap(pick.fplId)}
        className={`plate relative flex w-[4.7rem] flex-col items-center gap-0.5 px-1 pb-1.5 pt-2 ${
          sel ? 'ring-2 ring-[var(--accent)]' : ''
        }`}
      >
        {pick.isCaptain ? (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-[0.6rem] font-bold text-black">
            C
          </span>
        ) : pick.isVice ? (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-silver text-[0.6rem] font-bold text-black">
            V
          </span>
        ) : null}
        {benchIndex != null ? (
          <span className="absolute -left-1 -top-1.5 rounded-full bg-white/[0.1] px-1.5 text-[0.55rem] font-bold text-muted">
            {benchIndex + 1}
          </span>
        ) : null}
        <PlayerPhoto photoCode={p.photoCode} name={p.webName} size={38} />
        <span className="w-full truncate text-center text-[0.62rem] font-bold leading-tight text-white">
          {p.webName}
        </span>
        <span className="text-[0.55rem] font-semibold text-white/60">
          {p.clubShort}
          {p.status !== 'a' ? (
            <span
              className={`ml-1 inline-block h-1.5 w-1.5 rounded-full ${p.status === 'd' ? 'bg-gold' : 'bg-live'}`}
            />
          ) : null}
        </span>
      </button>
    );
  };

  const selectedPick = selected != null ? picks.find((p) => p.fplId === selected) : null;

  const pitchView = (
    <div className="space-y-3">
      <div className="pitch space-y-4 px-2 pb-5 pt-4">
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

      {selectedPick?.starting ? (
        <div className="card flex items-center gap-2 p-2.5">
          <p className="min-w-0 flex-1 truncate pl-1 text-xs text-muted">
            {byId.get(selectedPick.fplId)?.webName}: swap with a bench player, or
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
        </p>
        <div className="flex justify-evenly">
          {bench.map((p, i) => (
            <Plate key={p.fplId} pick={p} benchIndex={i} />
          ))}
        </div>
      </div>
    </div>
  );

  const listView = (
    <>
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
    <div className="space-y-3 pb-24">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          Formation{' '}
          <span className={`font-bold ${formationOk ? 'text-accent' : 'text-live'}`}>
            {counts.DEF}-{counts.MID}-{counts.FWD}
          </span>
        </p>
        <button
          onClick={() => setView(view === 'pitch' ? 'list' : 'pitch')}
          className="rounded-full border border-accent/40 px-3 py-1.5 text-xs font-bold text-accent"
        >
          {view === 'pitch' ? 'View Roster' : 'View Pitch'}
        </button>
      </div>

      {autoSet && !dirty ? (
        <p className="rounded-xl border border-gold/30 bg-gold/[0.08] px-3 py-2 text-center text-xs text-gold">
          This lineup was set automatically. Tap a starter then a bench player to swap.
        </p>
      ) : null}

      {view === 'pitch' ? pitchView : listView}

      {error ? (
        <p className="rounded-xl border border-live/40 bg-live/[0.08] px-3 py-2 text-center text-sm text-live">
          {error}
        </p>
      ) : null}

      {dirty ? (
        <div className="glass sticky bottom-[calc(6.25rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md gap-2 rounded-full p-2 lg:bottom-6">
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
