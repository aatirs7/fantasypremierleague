'use client';

import { useRouter } from 'next/navigation';

// Switches the active league from the home page, wc26 style: write the
// active-league cookie immediately so every other page picks it up on its
// next render, then refresh so already-visited pages re-fetch for the newly
// selected league instead of showing the old one.
export default function LeagueSwitcher({
  leagues,
  activeId,
}: {
  leagues: { id: string; name: string }[];
  activeId: string;
}) {
  const router = useRouter();

  function select(id: string) {
    if (id === activeId) return;
    document.cookie = `epld_active_league=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.push(`/home?league=${id}`);
    router.refresh();
  }

  return (
    <div className="reveal flex justify-center gap-2 overflow-x-auto pb-1">
      {leagues.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => select(l.id)}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium active:scale-95 ${
            l.id === activeId
              ? 'border-accent/50 bg-accent/10 text-accent'
              : 'border-edge bg-white/[0.02] text-muted'
          }`}
        >
          {l.name}
        </button>
      ))}
    </div>
  );
}
