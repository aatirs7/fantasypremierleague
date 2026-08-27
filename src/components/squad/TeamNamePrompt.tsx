'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';

// Nudge to name your team, shown while the squad is still on its default
// "<username> FC". Dismissible, and it never comes back once you name it.
export default function TeamNamePrompt({
  squadId,
  currentName,
  variant = 'card',
}: {
  squadId: string;
  currentName: string;
  variant?: 'card' | 'inline';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/squad', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ squadId, name }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) setError(data.error ?? 'Could not save');
      else {
        setOpen(false);
        router.refresh();
      }
    } catch {
      setError('Network error, try again');
    }
    setBusy(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          variant === 'card'
            ? 'tile tile-team reveal w-full shrink-0 px-3.5 py-2.5 text-center active:scale-[0.99]'
            : 'inline-flex items-center gap-1 text-xs font-semibold text-accent'
        }
      >
        {variant === 'card' ? (
          <>
            <span className="flex items-center justify-center gap-1.5">
              <Pencil className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.9} />
              <span className="text-[0.8rem] font-semibold leading-tight tracking-tight">
                Name your team
              </span>
            </span>
            <span className="mt-0.5 block text-[0.65rem] leading-tight text-muted">
              It shows on the table, the fixtures and every result
            </span>
          </>
        ) : (
          <>
            <Pencil className="h-3 w-3" />
            Rename
          </>
        )}
      </button>

      {open ? (
        <div className="modal-scrim" onClick={() => setOpen(false)}>
          <div
            className="modal-card reveal space-y-4 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <p className="text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
                Your club
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">Name your team</h2>
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              autoFocus
              placeholder="E.g. Real Sociedad of Colorado"
              className="min-h-12 w-full rounded-xl border border-edge bg-white/[0.04] px-4 text-center text-base font-semibold outline-none placeholder:text-muted-2 focus:border-accent/60"
            />
            <p className="text-xs text-muted">2 to 24 characters. Change it whenever you like.</p>
            {error ? <p className="text-xs text-live">{error}</p> : null}
            <div className="flex gap-2">
              <button
                onClick={() => setOpen(false)}
                className="min-h-11 flex-1 rounded-xl border border-edge text-sm font-semibold text-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => void save()}
                disabled={busy || name.trim().length < 2}
                className="btn-primary min-h-11 flex-[2]"
              >
                {busy ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
