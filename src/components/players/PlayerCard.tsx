import Link from 'next/link';

export type PlayerCardData = {
  fplId: number;
  webName: string;
  clubShort: string;
  position: string;
  price: string | null;
  draftRank: number | null;
  totalPoints: number;
  form: string | null;
  status: string;
  news: string | null;
  setPieceNotes: string | null;
};

export const POS_COLORS: Record<string, string> = {
  GK: 'bg-gold/15 text-gold',
  DEF: 'bg-silver/15 text-silver',
  MID: 'bg-accent/15 text-accent',
  FWD: 'bg-live/15 text-live',
};

export function StatusDot({ status }: { status: string }) {
  if (status === 'a') return null;
  const cls =
    status === 'd' ? 'bg-gold' : status === 'i' || status === 's' || status === 'u' ? 'bg-live' : 'bg-muted';
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} aria-label={`status ${status}`} />;
}

// One row in the scouting pool. Dense on purpose: rank, name, club,
// position, then the numbers that matter for drafting.
export default function PlayerCard({ p }: { p: PlayerCardData }) {
  return (
    <Link
      href={`/players/${p.fplId}`}
      className="card flex min-h-14 items-center gap-3 px-3 py-2.5 active:scale-[0.99]"
    >
      <span className="w-8 shrink-0 text-center font-display text-lg text-muted">
        {p.draftRank ?? '-'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-bold">{p.webName}</span>
          <StatusDot status={p.status} />
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <span>{p.clubShort}</span>
          <span className={`rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold ${POS_COLORS[p.position] ?? ''}`}>
            {p.position}
          </span>
          {p.setPieceNotes ? <span className="truncate text-muted-2">{p.setPieceNotes}</span> : null}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-bold tabular-nums">{p.totalPoints} pts</span>
        <span className="block text-xs text-muted tabular-nums">
          {p.form ?? '0.0'} form · {p.price ?? '?'}m
        </span>
      </span>
    </Link>
  );
}
