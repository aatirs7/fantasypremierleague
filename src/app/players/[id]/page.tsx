import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/lib/db';
import { draftQueues, fplPlayers, leagues } from '@/lib/schema';
import { readSession } from '@/lib/auth';
import { resolveActiveLeagueId } from '@/lib/leagues';
import { fetchElementSummary } from '@/lib/fpl';
import PlayerPhoto from '@/components/players/PlayerPhoto';
import ClubBadge from '@/components/matches/ClubBadge';
import PointsChart from '@/components/players/PointsChart';
import PlayerTabs from '@/components/players/PlayerTabs';
import WatchlistButton from '@/components/players/WatchlistButton';

export const dynamic = 'force-dynamic';

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

  // Watchlist wiring: only meaningful while the active league has not
  // drafted yet.
  let watchlist: { leagueId: string; queued: boolean; queue: number[] } | null = null;
  const activeLeagueId = await resolveActiveLeagueId(session.userId);
  if (activeLeagueId) {
    const [league] = await db
      .select({ draftStatus: leagues.draftStatus })
      .from(leagues)
      .where(eq(leagues.id, activeLeagueId))
      .limit(1);
    if (league?.draftStatus === 'pending') {
      const rows = await db
        .select({ fplId: draftQueues.fplId })
        .from(draftQueues)
        .where(and(eq(draftQueues.leagueId, activeLeagueId), eq(draftQueues.userId, session.userId)))
        .orderBy(asc(draftQueues.rank));
      const queue = rows.map((r) => r.fplId);
      watchlist = { leagueId: activeLeagueId, queued: queue.includes(fplId), queue };
    }
  }

  // The one permitted on-demand FPL fetch: history + fixtures for this view.
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

  const [firstName, ...restName] = (p.fullName || p.webName).split(' ');
  const lastName = restName.join(' ') || p.webName;

  const history = (summary?.history ?? []).filter((h) => h.round != null);
  const chartPoints = history.map((h) => ({ gw: h.round!, value: h.total_points ?? 0 }));

  const overview = (
    <div className="space-y-4">
      {chartPoints.length >= 2 ? (
        <div className="card p-4">
          <p className="text-sm font-bold">Points</p>
          <p className="mb-2 text-xs text-muted">This season</p>
          <PointsChart points={chartPoints} />
        </div>
      ) : (
        <p className="card p-4 text-center text-xs text-muted">
          The points chart appears once the season kicks off.
        </p>
      )}
      <div className="card grid grid-cols-3 gap-x-2 gap-y-3 p-4 text-center">
        {(
          [
            ['Draft rank', p.draftRank ?? '-'],
            ['Form', p.form ?? '-'],
            ['PPG', p.ppg ?? '-'],
            ['Minutes', p.minutes],
            ['Clean sheets', p.cleanSheets],
            ['Bonus', p.bonus],
            ['xG', p.xg ?? '-'],
            ['xA', p.xa ?? '-'],
            ['Owned', p.ownership ? `${p.ownership}%` : '-'],
          ] as [string, string | number][]
        ).map(([label, value]) => (
          <div key={label}>
            <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-muted-2">
              {label}
            </p>
            <p className="text-sm font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      {p.setPieceNotes ? (
        <p className="card p-3.5 text-center text-xs text-muted">
          Set pieces: <span className="font-bold text-foreground">{p.setPieceNotes}</span>
        </p>
      ) : null}
      {p.news ? (
        <p className="card border-gold/30 bg-gold/[0.06] p-3.5 text-center text-xs text-gold">
          {p.news}
          {p.chanceNext != null ? ` (${p.chanceNext}% chance next round)` : ''}
        </p>
      ) : null}
    </div>
  );

  const fixturesTab = summary?.fixtures?.length ? (
    <div className="card divide-y divide-[var(--line)] px-3">
      {summary.fixtures.slice(0, 8).map((f, i) => {
        const oppId = f.is_home ? f.team_a : f.team_h;
        const opp = oppId != null ? (clubShortById.get(oppId) ?? '?') : '?';
        return (
          <div key={i} className="flex min-h-11 items-center gap-3 py-2">
            <span className="w-12 text-xs font-bold text-muted">GW {f.event ?? '?'}</span>
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
  ) : (
    <p className="py-6 text-center text-sm text-muted">Fixtures unavailable right now.</p>
  );

  const historyTab = history.length ? (
    <div className="card divide-y divide-[var(--line)] px-3">
      {history
        .slice()
        .reverse()
        .slice(0, 12)
        .map((h, i) => (
          <div key={i} className="flex min-h-11 items-center gap-3 py-2 text-sm">
            <span className="w-12 text-xs font-bold text-muted">GW {h.round}</span>
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
  ) : (
    <p className="py-6 text-center text-sm text-muted">History appears once the season starts.</p>
  );

  return (
    <div className="reveal space-y-5 pb-3 pt-1 lg:mx-auto lg:max-w-2xl">
      {/* Hero */}
      <div className="relative min-h-52 overflow-hidden">
        <div className="absolute right-0 top-0 h-52 w-52 opacity-95">
          <PlayerPhoto photoCode={p.photoCode} name={p.webName} size={208} className="!rounded-none !bg-transparent !ring-0 object-contain" />
        </div>
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'linear-gradient(90deg, transparent 55%, transparent)' }}
          aria-hidden
        />
        <div className="relative flex items-start justify-between pr-14">
          <Link
            href="/players"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05]"
            aria-label="back"
          >
            <ArrowLeft className="h-5 w-5 text-muted" />
          </Link>
        </div>
        <div className="relative mt-6 max-w-[55%]">
          <p className="text-xl text-muted">{firstName}</p>
          <div className="flex items-center gap-2.5">
            <h1 className="text-4xl font-bold tracking-tight">{lastName}</h1>
            {watchlist ? (
              <WatchlistButton
                leagueId={watchlist.leagueId}
                fplId={fplId}
                initialQueued={watchlist.queued}
                initialQueue={watchlist.queue}
                variant="star"
              />
            ) : null}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
            <ClubBadge clubCode={p.clubCode} name={p.clubShort} size={18} />
            {p.clubName} <span className="text-muted-2">•</span> {p.position}
          </p>
          <div className="mt-4 flex gap-8">
            <div>
              <p className="text-2xl font-bold tabular-nums">{p.draftRank ?? '-'}</p>
              <p className="text-xs text-muted">Draft Rank</p>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{p.totalPoints}</p>
              <p className="text-xs text-muted">Points now</p>
            </div>
            {p.lastSeasonPoints != null ? (
              <div>
                <p className="text-2xl font-bold tabular-nums">{p.lastSeasonPoints}</p>
                <p className="text-xs text-muted">{p.lastSeason ?? 'Last season'}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Stat row */}
      <div className="card grid grid-cols-4 divide-x divide-[var(--line)] py-3.5 text-center">
        {(
          [
            [p.lastSeasonPoints ?? '-', p.lastSeason ?? 'Last season'],
            [p.lastSeasonStarts ?? '-', 'Starts last szn'],
            [p.goals, 'Goals'],
            [p.form ?? '0.0', 'Form'],
          ] as [string | number, string][]
        ).map(([value, label]) => (
          <div key={label}>
            <p className="text-xl font-bold tabular-nums">{value}</p>
            <p className="text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>

      <PlayerTabs
        tabs={[
          { label: 'Overview', content: overview },
          { label: 'Fixtures', content: fixturesTab },
          { label: 'History', content: historyTab },
        ]}
      />

      {watchlist ? (
        <div className="sticky bottom-[calc(7.5rem+env(safe-area-inset-bottom))] pt-1 lg:bottom-6">
          <WatchlistButton
            leagueId={watchlist.leagueId}
            fplId={fplId}
            initialQueued={watchlist.queued}
            initialQueue={watchlist.queue}
            variant="pill"
          />
        </div>
      ) : null}
    </div>
  );
}
