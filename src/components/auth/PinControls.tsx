'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';

type Member = { userId: string; name: string };

const PIN_INPUT =
  'min-h-12 w-full rounded-xl border border-edge bg-white/[0.04] px-4 text-center text-lg font-semibold tracking-[0.4em] outline-none placeholder:tracking-normal placeholder:text-muted-2 focus:border-accent/60';

function digits(v: string): string {
  return v.replace(/\D/g, '').slice(0, 4);
}

// Change your own PIN. Needs the current one.
export function ChangePin() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/me/pin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPin: current, newPin: next }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) setMsg({ ok: false, text: body.error ?? 'Could not change your PIN' });
      else {
        setMsg({ ok: true, text: 'PIN changed. Use it next time you log in.' });
        setCurrent('');
        setNext('');
      }
    } catch {
      setMsg({ ok: false, text: 'Network error, try again' });
    }
    setBusy(false);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-outline mx-auto w-full max-w-xs">
        <KeyRound className="h-4 w-4" />
        Change PIN
      </button>
    );
  }

  return (
    <div className="card mx-auto w-full max-w-xs space-y-3 p-4 text-center">
      <p className="text-sm font-semibold">Change your PIN</p>
      <input
        value={current}
        onChange={(e) => setCurrent(digits(e.target.value))}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="Current PIN"
        className={PIN_INPUT}
      />
      <input
        value={next}
        onChange={(e) => setNext(digits(e.target.value))}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="New PIN"
        className={PIN_INPUT}
      />
      {msg ? (
        <p className={`text-xs ${msg.ok ? 'text-accent' : 'text-live'}`}>{msg.text}</p>
      ) : null}
      <div className="flex gap-2">
        <button
          onClick={() => {
            setOpen(false);
            setMsg(null);
          }}
          className="min-h-11 flex-1 rounded-xl border border-edge text-sm font-semibold text-muted"
        >
          Close
        </button>
        <button
          onClick={() => void save()}
          disabled={busy || current.length !== 4 || next.length !== 4}
          className="btn-primary min-h-11 flex-[2]"
        >
          {busy ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// League owner resets a member who has forgotten their PIN.
export function ResetMemberPin({ leagueId, members }: { leagueId: string; members: Member[] }) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/league/${leagueId}/reset-pin`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, newPin: pin }),
      });
      const body = (await res.json()) as { error?: string };
      const who = members.find((m) => m.userId === userId)?.name ?? 'them';
      if (!res.ok) setMsg({ ok: false, text: body.error ?? 'Could not reset that PIN' });
      else {
        setMsg({ ok: true, text: `Done. Tell ${who} their new PIN is ${pin}.` });
        setPin('');
      }
    } catch {
      setMsg({ ok: false, text: 'Network error, try again' });
    }
    setBusy(false);
  };

  if (!members.length) return null;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-outline mx-auto w-full max-w-xs">
        <KeyRound className="h-4 w-4" />
        Reset a manager&apos;s PIN
      </button>
    );
  }

  return (
    <div className="card mx-auto w-full max-w-xs space-y-3 p-4 text-center">
      <div>
        <p className="text-sm font-semibold">Reset a manager&apos;s PIN</p>
        <p className="mt-0.5 text-xs text-muted">
          For someone locked out. Set a new PIN and tell them in person.
        </p>
      </div>
      <select
        value={userId}
        onChange={(e) => {
          setUserId(e.target.value);
          setMsg(null);
        }}
        className="min-h-12 w-full rounded-xl border border-edge bg-white/[0.04] px-3 text-center text-sm font-semibold outline-none focus:border-accent/60"
      >
        <option value="">Choose a manager</option>
        {members.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.name}
          </option>
        ))}
      </select>
      <input
        value={pin}
        onChange={(e) => setPin(digits(e.target.value))}
        inputMode="numeric"
        autoComplete="off"
        placeholder="New 4-digit PIN"
        className={PIN_INPUT}
      />
      {msg ? (
        <p className={`text-xs ${msg.ok ? 'text-accent' : 'text-live'}`}>{msg.text}</p>
      ) : null}
      <div className="flex gap-2">
        <button
          onClick={() => {
            setOpen(false);
            setMsg(null);
          }}
          className="min-h-11 flex-1 rounded-xl border border-edge text-sm font-semibold text-muted"
        >
          Close
        </button>
        <button
          onClick={() => void save()}
          disabled={busy || !userId || pin.length !== 4}
          className="btn-primary min-h-11 flex-[2]"
        >
          {busy ? 'Resetting...' : 'Reset PIN'}
        </button>
      </div>
    </div>
  );
}
