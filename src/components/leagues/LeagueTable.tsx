import Link from 'next/link';

export type LeagueTableRowView = {
  rank: number;
  userId: string;
  username: string;
  isYou: boolean;
  seasonTotal: number;
  currentGwPoints: number | null;
  currentGwLive: boolean;
  rankDelta: number;
  gained: number;
  leagueId: string;
};

// League standings with the labeled movement column: rank change in SPOTS
// stacked over points gained since the GW started. Never an unlabeled delta.
export default function LeagueTable({ rows }: { rows: LeagueTableRowView[] }) {
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <Link
          key={r.userId}
          href={`/league/${r.leagueId}/squad/${r.userId}`}
          className={`card flex min-h-14 items-center gap-3 px-3 py-2.5 active:scale-[0.99] ${
            r.rank <= 3 ? `podium-${r.rank}` : ''
          } ${r.isYou ? 'me-pulse border-accent' : ''}`}
        >
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-lg ${
              r.rank <= 3 ? `medal-${r.rank}` : 'bg-white/[0.04] text-muted'
            }`}
          >
            {r.rank}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 truncate font-bold">
              {r.username}
              {r.isYou ? (
                <span className="rounded-full bg-accent px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider text-[var(--accent-ink)]">
                  You
                </span>
              ) : null}
            </span>
            {r.currentGwPoints != null ? (
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                GW: <span className="font-bold tabular-nums">{r.currentGwPoints}</span>
                {r.currentGwLive ? (
                  <span className="flex items-center gap-1 text-[0.55rem] font-bold uppercase tracking-wider text-live">
                    <span className="live-dot h-1.5 w-1.5 rounded-full bg-live" />
                    Live
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>
          <span className="flex w-10 shrink-0 flex-col items-end text-[0.6rem] font-bold leading-tight">
            {r.rankDelta !== 0 ? (
              <>
                <span className={r.rankDelta > 0 ? 'text-accent' : 'text-live'}>
                  {r.rankDelta > 0 ? `▲${r.rankDelta}` : `▼${-r.rankDelta}`}
                </span>
                <span className="text-[0.5rem] font-semibold uppercase text-muted-2">spots</span>
              </>
            ) : null}
            {r.gained !== 0 ? (
              <>
                <span className={r.gained > 0 ? 'text-accent' : 'text-live'}>
                  {r.gained > 0 ? `+${r.gained}` : r.gained}
                </span>
                <span className="text-[0.5rem] font-semibold uppercase text-muted-2">pts</span>
              </>
            ) : null}
          </span>
          <span className="shrink-0 text-right">
            <span className="block font-display text-2xl tabular-nums">{r.seasonTotal}</span>
            <span className="block text-[0.6rem] font-bold uppercase tracking-wider text-muted-2">
              total
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
