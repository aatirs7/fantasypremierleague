import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { asc, eq, inArray } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/lib/db';
import { fplPlayers, gameweeks } from '@/lib/schema';
import { readSession } from '@/lib/auth';
import { fetchElementSummary } from '@/lib/fpl';
import { POS_COLORS, StatusDot } from '@/components/players/PlayerCard';
import PlayerPhoto from '@/components/players/PlayerPhoto';

export const dynamic = 'force-dynamic';

// Difficulty 1 easy .. 5 hard, FPL's own scale.
const FDR_CLS: Record<number, string> = {
  1: 'bg-accent/25 text-accent',
  2: 'bg-accent/15 text-accent',
  3: 'bg-white/[0.06] text-muted',
  4: 'bg-live/15 text-live',
  5: 'bg-live/30 text-live',
};

export default async function PlayerDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  const { id } = await params;
  if (!session) redirect(`/?next=/players/${id}`);
  const fplId = Number(id);
  if (!Number.isInteger(fplId)) notFound();

  const [p] = await db.select().from(fplPlayers).where(eq(fplPlayers.fplId, fplId)).limit(1);
  if (!p) notFound();

  // The one permitted on-demand FPL fetch: per-player history + fixtures for
  // this detail view only, never in bulk. Best-effort: the page still works
  // from Neon data if FPL is down.
  let summary: Awaited<ReturnType<typeof fetchElementSummary>> | null = null;
  try {
    summary = await fetchElementSummary(fplId);
  } catch {
    summary = null;
  }

  const clubIds = new Set<number>();
  for (const f of summary?.fixtures ?? []) {
    if (f.team_h != null) clubIds.add(f.team_h);
    if (f.team_a != null) clubIds.add(f.team_a);
  }
  const clubRows = clubIds.size
    ? await db
        .selectDistinct({ clubId: fplPlayers.clubId, clubShort: fplPlayers.clubShort })
        .from(fplPlayers)
        .where(inArray(fplPlayers.clubId, [...clubIds]))
    : [];
  const clubShortById = new Map(clubRows.map((c) => [c.clubId, c.clubShort]));

  const nextDeadline = await db
    .select()
    .from(gameweeks)
    .where(eq(gameweeks.isNext, true))
    .orderBy(asc(gameweeks.gw))
    .limit(1);

  const stats: [string, string | number][] = [
    ['Draft rank', p.draftRank ?? '-'],
    ['Price', p.price ? `${p.price}m` : '-'],
    ['Total points', p.totalPoints],
    ['Form', p.form ?? '-'],
    ['PPG', p.ppg ?? '-'],
    ['Owned', p.ownership ? `${p.ownership}%` : '-'],
    ['Goals', p.goals],
    ['Assists', p.assists],
    ['Clean sheets', p.cleanSheets],
    ['Minutes', p.minutes],
    ['Bonus', p.bonus],
    ['xG', p.xg ?? '-'],
    ['xA', p.xa ?? '-'],
    ['ICT', p.ictIndex ?? '-'],
  ];

  return (
    <div className="reveal space-y-4 py-4 lg:mx-auto lg:max-w-2xl">
      <Link href="/players" className="flex items-center gap-1 text-sm font-semibold text-muted">
        <ArrowLeft className="h-4 w-4" /> Players
      </Link>

      <div className="card flex items-center gap-4 p-4">
        <PlayerPhoto photoCode={p.photoCode} name={p.webName} size={76} />
        <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-4xl">{p.webName}</h1>
          <StatusDot status={p.status} />
        </div>
        <p className="mt-1 flex items-center gap-2 text-sm text-muted">
          {p.clubName}
          <span className={`rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold ${POS_COLORS[p.position] ?? ''}`}>
            {p.position}
          </span>
          {p.setPieceNotes ? <span className="text-muted-2">{p.setPieceNotes}</span> : null}
        </p>
        {p.news ? (
          <p className="mt-2 rounded-xl border border-gold/30 bg-gold/[0.08] px-3 py-2 text-xs text-gold">
            {p.news}
            {p.chanceNext != null ? ` (${p.chanceNext}% chance next round)` : ''}
          </p>
        ) : null}
        </div>
      </div>

      <div className="card grid grid-cols-3 gap-x-2 gap-y-3 p-4">
        {stats.map(([label, value]) => (
          <div key={label}>
            <p className="text-[0.6rem] font-bold uppercase tracking-wider text-muted-2">{label}</p>
            <p className="text-sm font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {summary?.fixtures?.length ? (
        <div className="space-y-2">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
            Upcoming fixtures
          </p>
          <div className="card divide-y divide-[var(--line)] px-3">
            {summary.fixtures.slice(0, 6).map((f, i) => {
              const oppId = f.is_home ? f.team_a : f.team_h;
              const opp = oppId != null ? (clubShortById.get(oppId) ?? '?') : '?';
              return (
                <div key={i} className="flex min-h-11 items-center gap-3 py-2">
                  <span className="w-10 text-xs font-bold text-muted">GW{f.event ?? '?'}</span>
                  <span className="flex-1 text-sm font-semibold">
                    {opp} {f.is_home ? '(H)' : '(A)'}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${FDR_CLS[f.difficulty ?? 3] ?? ''}`}
                  >
                    FDR {f.difficulty ?? '?'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {summary?.history?.length ? (
        <div className="space-y-2">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
            This season
          </p>
          <div className="card divide-y divide-[var(--line)] px-3">
            {summary.history
              .slice()
              .reverse()
              .slice(0, 10)
              .map((h, i) => (
                <div key={i} className="flex min-h-11 items-center gap-3 py-2 text-sm">
                  <span className="w-10 text-xs font-bold text-muted">GW{h.round ?? '?'}</span>
                  <span className="flex-1 text-xs text-muted">
                    {h.minutes ?? 0} mins
                    {h.goals_scored ? ` · ${h.goals_scored}G` : ''}
                    {h.assists ? ` · ${h.assists}A` : ''}
                    {h.bonus ? ` · ${h.bonus} bonus` : ''}
                  </span>
                  <span className="font-bold tabular-nums text-accent">{h.total_points ?? 0} pts</span>
                </div>
              ))}
          </div>
        </div>
      ) : (
        <p className="text-center text-xs text-muted">
          {nextDeadline[0]
            ? 'Gameweek history will appear once the season starts.'
            : 'No history yet.'}
        </p>
      )}
    </div>
  );
}
