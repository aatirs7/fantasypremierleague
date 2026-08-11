'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Owner-only control to schedule or reschedule the draft while pending.
export default function ScheduleDraft({
  leagueId,
  currentIso,
}: {
  leagueId: string;
  currentIso: string | null;
}) {
  const router = useRouter();
  // datetime-local wants local time without zone.
  const toLocalInput = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [value, setValue] = useState(toLocalInput(currentIso));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (busy || !value) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/league', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'schedule',
          leagueId,
          draftTime: new Date(value).toISOString(),
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Could not save');
      } else {
        router.refresh();
      }
    } catch {
      setError('Network error');
    }
    setBusy(false);
  };

  return (
    <div className="card space-y-3 p-4">
      <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
        {currentIso ? 'Reschedule draft' : 'Schedule the draft'}
      </p>
      <div className="flex gap-2">
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-h-11 w-full rounded-xl border border-edge bg-white/[0.03] px-3.5 text-sm outline-none focus:border-accent/60 [color-scheme:dark]"
        />
        <button
          onClick={save}
          disabled={busy || !value}
          className="btn-primary min-h-11"
        >
          {busy ? '...' : 'Save'}
        </button>
      </div>
      {error ? <p className="text-xs text-live">{error}</p> : null}
    </div>
  );
}
