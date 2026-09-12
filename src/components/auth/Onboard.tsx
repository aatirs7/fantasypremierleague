'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PinInput from './PinInput';

type Mode = 'login' | 'register';
// 'reset' is reached from the sign-in form, not from the tabs.
type View = Mode | 'reset';

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
  const [mode, setMode] = useState<View>(initialMode);
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
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

  const validCode = /^[A-Za-z0-9]{6}$/.test(code);
  const canSubmit = validUsername && pin.length === 4 && (mode !== 'reset' || validCode);

  const submit = async () => {
    if (busy || !canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(mode === 'reset' ? '/api/auth/reset-pin' : `/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(mode === 'reset' ? { username, code, pin } : { username, pin }),
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
      <div className={`card flex p-1 ${mode === 'reset' ? 'hidden' : ''}`}>
        {(['login', 'register'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setCode('');
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

      <div className="card flex flex-col gap-4 p-4 text-center">
        {mode === 'reset' ? (
          <div>
            <h2 className="font-display text-2xl leading-none">Reset your PIN</h2>
            <p className="mt-1.5 text-xs text-muted">Enter your username, the code from Aatir, and a new PIN.</p>
          </div>
        ) : null}
        <div>
          <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Username</p>
          <input
            className={`${INPUT_CLS} text-center`}
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

        {mode === 'reset' ? (
          <div>
            <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Reset code</p>
            <input
              className={`${INPUT_CLS} text-center uppercase tracking-[0.3em]`}
              placeholder="6 characters"
              value={code}
              name="reset-code"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
            />
            <p className="mt-1.5 text-xs text-muted">
              Ask Aatir for a reset code. It works once and expires after 24 hours.
            </p>
          </div>
        ) : null}

        <PinInput
          value={pin}
          onChange={setPin}
          label={mode === 'register' ? 'Choose a 4-digit PIN' : mode === 'reset' ? 'Choose a new PIN' : 'Your PIN'}
        />

        {mode === 'register' ? (
          <p className="text-center text-xs text-muted">
            Remember your PIN. You can change it any time from your profile.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-live/40 bg-live/[0.08] px-3 py-2 text-center text-sm text-live">
            {error}
          </p>
        ) : null}

        <button onClick={submit} disabled={busy || !canSubmit} className="btn-primary w-full">
          {busy
            ? 'One sec...'
            : mode === 'login'
              ? 'Log In'
              : mode === 'reset'
                ? 'Set new PIN'
                : 'Get Started'}
        </button>

        {mode === 'login' ? (
          <button
            type="button"
            onClick={() => {
              setMode('reset');
              setPin('');
              setError(null);
            }}
            className="text-xs font-semibold text-muted underline-offset-2 hover:underline"
          >
            Forgot your PIN?
          </button>
        ) : null}
        {mode === 'reset' ? (
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setCode('');
              setPin('');
              setError(null);
            }}
            className="text-xs font-semibold text-muted underline-offset-2 hover:underline"
          >
            Back to sign in
          </button>
        ) : null}
      </div>
    </div>
  );
}
