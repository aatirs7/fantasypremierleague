'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import PinInput from '@/components/auth/PinInput';

const SELECT_CLS =
  'min-h-11 w-full rounded-xl border border-edge bg-white/[0.03] px-3.5 text-sm outline-none focus:border-accent/60 [color-scheme:dark]';

// Owner-only control: set a fresh 4-digit PIN for a member who forgot
// theirs. There is no email on this site, so this is the reset path.
export default function ResetMemberPin({
  leagueId,
  members,
}: {
  leagueId: string;
  members: { userId: string; username: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const reset = async () => {
    if (busy || !userId || pin.length !== 4) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch('/api/league', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'reset-pin', leagueId, userId, pin }),
      });
      const data = (await res.json()) as { username?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not reset the PIN');
      } else {
        setDone(data.username ?? 'That manager');
        setPin('');
      }
    } catch {
      setError('Network error, try again');
    }
    setBusy(false);
  };

  if (members.length === 0) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-edge bg-white/[0.03] px-4 text-sm font-bold text-muted active:scale-95"
      >
        <KeyRound className="h-4 w-4" />
        Reset a manager&apos;s PIN
      </button>
    );
  }

  return (
    <div className="card space-y-4 p-4 text-center">
      <div>
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
          Reset a manager&apos;s PIN
        </p>
        <p className="mt-1 text-xs text-muted">
          Someone forgot their PIN? Pick them, choose a new 4-digit PIN, then tell them what it is.
          They can change it again from their profile.
        </p>
      </div>
      <select
        className={SELECT_CLS}
        value={userId}
        onChange={(e) => {
          setUserId(e.target.value);
          setDone(null);
          setError(null);
        }}
      >
        <option value="">Choose a manager</option>
        {members.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.username}
          </option>
        ))}
      </select>
      <PinInput value={pin} onChange={setPin} label="New 4-digit PIN" />
      {error ? (
        <p className="rounded-xl border border-live/40 bg-live/[0.08] px-3 py-2 text-sm text-live">{error}</p>
      ) : null}
      {done ? (
        <p className="rounded-xl border border-accent/40 bg-accent/[0.08] px-3 py-2 text-sm text-accent">
          Done. {done} can now log in with the new PIN.
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          onClick={() => {
            setOpen(false);
            setPin('');
            setError(null);
            setDone(null);
          }}
          className="btn-outline min-h-11 flex-1"
        >
          Close
        </button>
        <button onClick={reset} disabled={busy || !userId || pin.length !== 4} className="btn-primary min-h-11 flex-1">
          {busy ? 'One sec...' : 'Set new PIN'}
        </button>
      </div>
    </div>
  );
}
