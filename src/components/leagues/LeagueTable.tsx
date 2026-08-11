import Link from 'next/link';
import Avatar from '@/components/Avatar';

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

// Standings per the reference design: POS / MANAGER / PTS with avatars,
// your own row wrapped in a violet outline. Movement stays labeled (spots
// and pts are different units).
export default function LeagueTable({ rows }: { rows: LeagueTableRowView[] }) {
  return (
    <div className="card px-3">
      <div className="flex min-h-8 items-center gap-3 py-2 text-[0.62rem] font-semibold uppercase tracking-wider text-muted-2">
        <span className="w-6 text-center">Pos</span>
        <span className="flex-1 pl-10">Manager</span>
        <span className="w-10" />
        <span className="w-12 text-right">Pts</span>
      </div>
      <div className="space-y-1 pb-2">
        {rows.map((r) => (
          <Link
            key={r.userId}
            href={`/league/${r.leagueId}/squad/${r.userId}`}
            className={`flex min-h-13 items-center gap-3 rounded-xl px-2 py-1.5 active:scale-[0.99] ${
              r.isYou
                ? 'border border-accent/60 bg-accent/[0.08]'
                : 'border border-transparent'
            }`}
          >
            <span
              className={`w-6 shrink-0 text-center text-sm font-bold tabular-nums ${
                r.rank <= 3 ? 'text-gold' : 'text-muted'
              }`}
            >
              {r.rank}
            </span>
            <Avatar name={r.username} size={34} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold">
                {r.username}
                {r.isYou ? <span className="ml-1.5 text-[0.6rem] font-bold text-accent">YOU</span> : null}
              </span>
              {r.currentGwPoints != null ? (
                <span className="flex items-center gap-1.5 text-[0.65rem] text-muted">
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
            <span className="w-12 shrink-0 text-right text-base font-bold tabular-nums">
              {r.seasonTotal}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
