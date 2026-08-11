'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import PlayerPhoto from './PlayerPhoto';

type Suggestion = {
  fplId: number;
  photoCode: number | null;
  webName: string;
  clubShort: string;
  position: string;
  totalPoints: number;
};

// Search with live suggestions: start typing "del" and Delap and friends
// drop down instantly. Tap a suggestion for the player page; press enter to
// filter the list below instead.
export default function PlayerSearch({
  initial,
  hiddenParams,
}: {
  initial: string;
  hiddenParams: Record<string, string>;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [pool, setPool] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/players/pool');
        if (res.ok) {
          const data = (await res.json()) as { players: Suggestion[] };
          setPool(data.players);
        }
      } catch {
        // suggestions just stay empty
      }
    })();
  }, []);

  useEffect(() => {
    const onTap = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onTap);
    return () => document.removeEventListener('mousedown', onTap);
  }, []);

  const needle = q.trim().toLowerCase();
  const matches = needle
    ? pool.filter((p) => p.webName.toLowerCase().includes(needle)).slice(0, 6)
    : [];

  const submit = () => {
    const params = new URLSearchParams(hiddenParams);
    if (q.trim()) params.set('q', q.trim());
    setOpen(false);
    router.push(params.toString() ? `/players?${params.toString()}` : '/players');
  };

  return (
    <div ref={boxRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-[1.375rem] h-4 w-4 -translate-y-1/2 text-muted-2" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder="Search players"
        className="min-h-11 w-full rounded-xl border border-edge bg-white/[0.03] pl-9 pr-3.5 text-sm outline-none placeholder:text-muted-2 focus:border-accent/60"
      />
      {open && matches.length > 0 ? (
        <div className="glass absolute inset-x-0 top-12 z-40 overflow-hidden rounded-xl">
          {matches.map((p) => (
            <button
              key={p.fplId}
              onClick={() => router.push(`/players/${p.fplId}`)}
              className="flex min-h-12 w-full items-center gap-2.5 px-3 text-left hover:bg-white/[0.04]"
            >
              <PlayerPhoto photoCode={p.photoCode} name={p.webName} size={30} />
              <span className="min-w-0 flex-1 truncate text-sm font-bold">{p.webName}</span>
              <span className="shrink-0 text-xs text-muted">
                {p.clubShort} · {p.position} · {p.totalPoints} pts
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
