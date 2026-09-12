'use client';

import { useEffect, useState } from 'react';
import { Copy, KeyRound, Search } from 'lucide-react';

type FoundUser = {
  id: string;
  username: string;
  createdAt: string;
  resetPending: boolean;
  resetExpiresAt: string | null;
  leagues: string[];
};

type Issued = { code: string; expiresAt: string };

const INPUT_CLS =
  'min-h-11 w-full rounded-xl border border-edge bg-white/[0.03] px-3.5 text-sm outline-none placeholder:text-muted-2 focus:border-accent/60';

// Search real accounts by any part of the username, then issue a one-time
// reset code or set a PIN outright. The code is shown once, here, and
// never stored in the clear, so copy it before leaving the page.
export default function AdminUsers() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<FoundUser[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<Record<string, Issued>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pinFor, setPinFor] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const needle = q.trim();

  // Debounced search; state is reset in the change handler, not here.
  useEffect(() => {
    if (needle.length < 2) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/dev/users?q=${encodeURIComponent(needle)}`);
        const data = (await res.json()) as { users?: FoundUser[]; error?: string };
        if (!res.ok) {
          setError(data.error ?? 'Search failed');
          setResults(null);
        } else {
          setResults(data.users ?? []);
        }
      } catch {
        setError('Network error, try again');
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [needle]);

  const post = async (username: string, body: Record<string, string>) => {
    const res = await fetch('/api/dev/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, ...body }),
    });
    const data = (await res.json()) as { error?: string; code?: string; expiresAt?: string };
    if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
    return data;
  };

  const issueCode = async (u: FoundUser) => {
    if (busyId) return;
    setBusyId(u.id);
    setError(null);
    try {
      const data = await post(u.username, {});
      if (data.code && data.expiresAt) {
        setIssued((m) => ({ ...m, [u.id]: { code: data.code!, expiresAt: data.expiresAt! } }));
        setResults((rs) =>
          rs?.map((r) => (r.id === u.id ? { ...r, resetPending: true, resetExpiresAt: data.expiresAt! } : r)) ?? rs,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusyId(null);
    }
  };

  const savePin = async (u: FoundUser) => {
    if (busyId || !/^\d{4}$/.test(pin)) return;
    setBusyId(u.id);
    setError(null);
    try {
      await post(u.username, { pin });
      setPinFor(null);
      setPin('');
      setIssued((m) => {
        const next = { ...m };
        delete next[u.id];
        return next;
      });
      setResults((rs) =>
        rs?.map((r) => (r.id === u.id ? { ...r, resetPending: false, resetExpiresAt: null } : r)) ?? rs,
      );
      setCopied(`pin:${u.id}`);
      setTimeout(() => setCopied(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusyId(null);
    }
  };

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard blocked: the code is on screen anyway.
    }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Find a manager</p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
          <input
            className={`${INPUT_CLS} pl-9`}
            placeholder="Any part of the username, e.g. brown"
            value={q}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => {
              setQ(e.target.value);
              setError(null);
              if (e.target.value.trim().length < 2) setResults(null);
            }}
          />
        </div>
        <p className="mt-1.5 text-xs text-muted">Spaces are ignored, so &quot;brown sugar&quot; still finds brownsugar.</p>
      </div>

      {error ? (
        <p className="rounded-xl border border-live/40 bg-live/[0.08] px-3 py-2 text-center text-sm text-live">
          {error}
        </p>
      ) : null}

      {searching && results === null ? <p className="text-center text-xs text-muted">Searching...</p> : null}
      {results && results.length === 0 ? (
        <p className="text-center text-sm text-muted">No accounts match that.</p>
      ) : null}

      {results?.map((u) => {
        const code = issued[u.id];
        return (
          <div key={u.id} className="card space-y-3 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="block truncate font-display text-lg leading-none">{u.username}</span>
                <span className="block truncate text-xs text-muted">
                  {u.leagues.length ? u.leagues.join(', ') : 'Not in a league yet'}
                </span>
              </div>
              {u.resetPending && !code ? (
                <span className="shrink-0 rounded-lg border border-edge px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-muted">
                  Code pending
                </span>
              ) : null}
            </div>

            {code ? (
              <div className="rounded-xl border border-accent/40 bg-accent/10 p-3 text-center">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Reset code</p>
                <p className="mt-1 font-display text-3xl tracking-[0.3em] text-accent">{code.code}</p>
                <p className="mt-1 text-xs text-muted">
                  Send this to {u.username}. Works once, expires {fmt(code.expiresAt)}.
                </p>
                <button
                  onClick={() => copy(u.id, code.code)}
                  className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-accent/40 px-3 text-xs font-bold text-accent active:scale-95"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied === u.id ? 'Copied' : 'Copy code'}
                </button>
              </div>
            ) : null}

            {pinFor === u.id ? (
              <div className="space-y-2">
                <input
                  className={`${INPUT_CLS} text-center tracking-[0.5em]`}
                  placeholder="New 4-digit PIN"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  autoComplete="off"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => savePin(u)}
                    disabled={busyId === u.id || pin.length !== 4}
                    className="btn-primary min-h-11 flex-1 text-xs"
                  >
                    {busyId === u.id ? 'One sec...' : 'Save PIN'}
                  </button>
                  <button
                    onClick={() => {
                      setPinFor(null);
                      setPin('');
                    }}
                    className="btn-outline min-h-11 flex-1 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => issueCode(u)}
                  disabled={busyId === u.id}
                  className="btn-primary min-h-11 flex-1 text-xs"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  {busyId === u.id ? 'One sec...' : code || u.resetPending ? 'New reset code' : 'Reset code'}
                </button>
                <button
                  onClick={() => {
                    setPinFor(u.id);
                    setPin('');
                  }}
                  className="btn-outline min-h-11 flex-1 text-xs"
                >
                  {copied === `pin:${u.id}` ? 'PIN set' : 'Set PIN directly'}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
