'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PinInput from './PinInput';

type Mode = 'login' | 'register';

const INPUT_CLS =
  'min-h-11 w-full rounded-xl border border-edge bg-white/[0.03] px-3.5 text-sm outline-none placeholder:text-muted-2 focus:border-accent/60';

export default function Onboard({
  next,
  initialMode = 'login',
}: {
  next?: string;
  initialMode?: Mode;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);

  const validUsername = /^[A-Za-z0-9_]{3,20}$/.test(username);

  // Debounced availability check while registering.
  useEffect(() => {
    setAvailable(null);
    if (mode !== 'register' || !validUsername) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-username?u=${encodeURIComponent(username)}`);
        const { available } = (await res.json()) as { available: boolean };
        setAvailable(available);
      } catch {
        // network hiccup: no verdict
      }
    }, 400);
    return () => clearTimeout(t);
  }, [mode, username, validUsername]);

  const submit = async () => {
    if (busy || !validUsername || pin.length !== 4) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, pin }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong');
        setBusy(false);
        return;
      }
      router.push(next || '/home');
      router.refresh();
    } catch {
      setError('Network error, try again');
      setBusy(false);
    }
  };

  return (
    <div className="reveal mx-auto flex w-full max-w-sm flex-col gap-5">
      <div className="card flex p-1">
        {(['login', 'register'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`min-h-11 flex-1 rounded-xl text-sm font-bold transition-colors ${
              mode === m ? 'bg-accent text-[var(--accent-ink)]' : 'text-muted'
            }`}
          >
            {m === 'login' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      <div className="card flex flex-col gap-4 p-4">
        <div>
          <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Username</p>
          <input
            className={INPUT_CLS}
            placeholder="e.g. rayyan_10"
            value={username}
            name="draft-nickname"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setUsername(e.target.value.trim())}
          />
          {mode === 'register' && username && !validUsername ? (
            <p className="mt-1.5 text-xs text-live">3-20 characters: letters, numbers, underscores.</p>
          ) : null}
          {mode === 'register' && validUsername && available === false ? (
            <p className="mt-1.5 text-xs text-live">That username is taken.</p>
          ) : null}
          {mode === 'register' && validUsername && available === true ? (
            <p className="mt-1.5 text-xs text-accent">Available.</p>
          ) : null}
        </div>

        <PinInput value={pin} onChange={setPin} label={mode === 'register' ? 'Choose a 4-digit PIN' : 'Your PIN'} />

        {mode === 'register' ? (
          <p className="text-center text-xs text-muted">
            Remember your PIN, there is no reset.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-live/40 bg-live/[0.08] px-3 py-2 text-center text-sm text-live">
            {error}
          </p>
        ) : null}

        <button
          onClick={submit}
          disabled={busy || !validUsername || pin.length !== 4}
          className="btn-primary w-full"
        >
          {busy ? 'One sec...' : mode === 'login' ? 'Log In' : 'Get Started'}
        </button>
      </div>
    </div>
  );
}
