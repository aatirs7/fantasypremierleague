'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import PinInput from './PinInput';

// Profile card: prove the current PIN, pick a new one. Collapsed by default
// so the profile stays quiet for the 99% of visits that are not about this.
export default function ChangePin() {
  const [open, setOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reset = () => {
    setCurrentPin('');
    setNewPin('');
    setError(null);
  };

  const submit = async () => {
    if (busy || currentPin.length !== 4 || newPin.length !== 4) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/change-pin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPin, newPin }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong');
        return;
      }
      reset();
      setOpen(false);
      setDone(true);
    } catch {
      setError('Network error, try again');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => {
          setDone(false);
          setOpen(true);
        }}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-edge bg-white/[0.03] px-4 text-sm font-bold text-muted active:scale-95"
      >
        <KeyRound className="h-4 w-4" />
        {done ? 'PIN changed' : 'Change PIN'}
      </button>
    );
  }

  return (
    <div className="card flex flex-col gap-4 p-4">
      <PinInput value={currentPin} onChange={setCurrentPin} label="Current PIN" />
      <PinInput value={newPin} onChange={setNewPin} label="New PIN" />
      {error ? (
        <p className="rounded-xl border border-live/40 bg-live/[0.08] px-3 py-2 text-center text-sm text-live">
          {error}
        </p>
      ) : null}
      <button
        onClick={submit}
        disabled={busy || currentPin.length !== 4 || newPin.length !== 4}
        className="btn-primary w-full"
      >
        {busy ? 'One sec...' : 'Save new PIN'}
      </button>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(false);
        }}
        className="text-xs font-semibold text-muted"
      >
        Cancel
      </button>
    </div>
  );
}
