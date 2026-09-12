'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import PinInput from './PinInput';

// Signed-in users can pick a new PIN without knowing the old one: the
// session cookie already proves who they are. This is the self-serve
// recovery for someone still logged in on their phone.
export default function ChangePin() {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const save = async () => {
    if (busy || pin.length !== 4) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/pin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not change the PIN');
      } else {
        setDone(true);
        setPin('');
      }
    } catch {
      setError('Network error, try again');
    }
    setBusy(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-edge bg-white/[0.03] px-4 text-sm font-bold text-muted active:scale-95"
      >
        <KeyRound className="h-4 w-4" />
        Change my PIN
      </button>
    );
  }

  return (
    <div className="card space-y-4 p-4 text-center">
      <div>
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Change my PIN</p>
        <p className="mt-1 text-xs text-muted">Pick a new 4-digit PIN. You will use it next time you log in.</p>
      </div>
      <PinInput value={pin} onChange={setPin} label="New 4-digit PIN" />
      {error ? (
        <p className="rounded-xl border border-live/40 bg-live/[0.08] px-3 py-2 text-sm text-live">{error}</p>
      ) : null}
      {done ? (
        <p className="rounded-xl border border-accent/40 bg-accent/[0.08] px-3 py-2 text-sm text-accent">
          Your PIN is updated.
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          onClick={() => {
            setOpen(false);
            setPin('');
            setError(null);
            setDone(false);
          }}
          className="btn-outline min-h-11 flex-1"
        >
          Close
        </button>
        <button onClick={save} disabled={busy || pin.length !== 4} className="btn-primary min-h-11 flex-1">
          {busy ? 'One sec...' : 'Save PIN'}
        </button>
      </div>
    </div>
  );
}
