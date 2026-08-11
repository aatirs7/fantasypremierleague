'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const INPUT_CLS =
  'min-h-11 w-full rounded-xl border border-edge bg-white/[0.03] px-3.5 text-sm outline-none placeholder:text-muted-2 focus:border-accent/60';
const BTN_CLS =
  'btn-primary min-h-11';

export default function LeagueActions() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (payload: object, kind: 'create' | 'join') => {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch('/api/league', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { league?: { id: string }; error?: string };
      if (!res.ok || !data.league) {
        setError(data.error ?? 'Something went wrong');
        setBusy(null);
        return;
      }
      router.push(`/league/${data.league.id}`);
      router.refresh();
    } catch {
      setError('Network error, try again');
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-xl border border-live/40 bg-live/[0.08] px-3 py-2 text-center text-sm text-live">
          {error}
        </p>
      ) : null}
      <div className="card space-y-3 p-4">
        <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Join a league</p>
        <div className="flex gap-2">
          <input
            className={`${INPUT_CLS} font-mono uppercase tracking-[0.2em]`}
            placeholder="CODE"
            maxLength={6}
            value={code}
            autoCapitalize="characters"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button
            className={BTN_CLS}
            disabled={code.trim().length < 4 || !!busy}
            onClick={() => act({ action: 'join', code }, 'join')}
          >
            {busy === 'join' ? '...' : 'Join'}
          </button>
        </div>
      </div>
      <div className="card space-y-3 p-4">
        <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Start a new league</p>
        <div className="flex gap-2">
          <input
            className={INPUT_CLS}
            placeholder="League name"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className={BTN_CLS}
            disabled={!name.trim() || !!busy}
            onClick={() => act({ action: 'create', name: name.trim() }, 'create')}
          >
            {busy === 'create' ? '...' : 'Create'}
          </button>
        </div>
        <p className="text-xs text-muted">4 managers minimum. Share the join code before the draft.</p>
      </div>
    </div>
  );
}
