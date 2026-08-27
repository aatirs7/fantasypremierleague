import { desc, eq, inArray } from 'drizzle-orm';
import { Crown, Repeat, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { db } from '@/lib/db';
import {
  fplPlayers,
  gwScores,
  leagues,
  squads,
  trades,
  users,
  waiverClaims,
} from '@/lib/schema';
import { leagueTable } from '@/lib/scoring';
import { squadContributions } from '@/lib/contributions';
import PlayerPhoto from '@/components/players/PlayerPhoto';

// League stats: records, market activity, and the league MVP. Everything
// here derives from stored scores, so it sharpens every finalized GW. Lives
// as a tab on the league page rather than its own route, so moving between
// Head to head, Standings and Stats never feels like leaving the app.
export default async function LeagueStats({ leagueId }: { leagueId: string }) {
  const id = leagueId;

  const squadRows = await db
    .select({ id: squads.id, userId: squads.userId, username: users.username })
    .from(squads)
    .innerJoin(users, eq(users.id, squads.userId))
    .where(eq(squads.leagueId, id));
  const nameBySquad = new Map(squadRows.map((s) => [s.id, s.username]));
  const nameByUser = new Map(squadRows.map((s) => [s.userId, s.username]));
  const squadIds = squadRows.map((s) => s.id);

  const table = await leagueTable(id, null);
  const played = table.some((r) => r.seasonTotal > 0 || r.gwWins > 0);

  const scores = squadIds.length
    ? await db.select().from(gwScores).where(inArray(gwScores.squadId, squadIds))
    : [];

  const bestGw = scores.slice().sort((a, b) => b.totalPoints - a.totalPoints)[0] ?? null;
  const bestCaptain = scores.slice().sort((a, b) => b.captainBonus - a.captainBonus)[0] ?? null;
  const autosubCounts = new Map<string, number>();
  for (const s of scores) {
    autosubCounts.set(s.squadId, (autosubCounts.get(s.squadId) ?? 0) + s.autosubs.length);
  }
  const benchHero = [...autosubCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  const claimRows = await db
    .select({ userId: waiverClaims.userId, status: waiverClaims.status })
    .from(waiverClaims)
    .where(eq(waiverClaims.leagueId, id));
  const approvedCounts = new Map<string, number>();
  for (const c of claimRows) {
    if (c.status !== 'approved') continue;
    approvedCounts.set(c.userId, (approvedCounts.get(c.userId) ?? 0) + 1);
  }
  const tradeRows = await db
    .select({ proposerId: trades.proposerId, receiverId: trades.receiverId, status: trades.status })
    .from(trades)
    .where(eq(trades.leagueId, id));
  const executedTrades = tradeRows.filter((t) => t.status === 'executed').length;

  // League MVP: the player who has contributed the most points to any one
  // squad across the season.
  let mvp: { fplId: number; points: number; squadOwner: string } | null = null;
  if (played) {
    for (const s of squadRows) {
      const contrib = await squadContributions(s.id);
      for (const c of contrib.values()) {
        if (!mvp || c.points > mvp.points) {
          mvp = { fplId: c.fplId, points: c.points, squadOwner: s.username };
        }
      }
    }
  }
  const mvpPlayer = mvp
    ? (
        await db
          .select({
            fplId: fplPlayers.fplId,
            photoCode: fplPlayers.photoCode,
            webName: fplPlayers.webName,
            clubShort: fplPlayers.clubShort,
          })
          .from(fplPlayers)
          .where(eq(fplPlayers.fplId, mvp.fplId))
          .limit(1)
      )[0]
    : null;

  const StatCard = ({
    icon: Icon,
    label,
    value,
    detail,
    tone = 'text-accent',
  }: {
    icon: typeof Crown;
    label: string;
    value: string;
    detail: string;
    tone?: string;
  }) => (
    <div className="card flex flex-col items-center gap-1 p-4 text-center">
      <Icon className={`h-5 w-5 ${tone}`} />
      <p className="text-[0.6rem] font-bold uppercase tracking-wider text-muted-2">{label}</p>
      <p className={`font-display text-3xl leading-none ${tone}`}>{value}</p>
      <p className="text-xs text-muted">{detail}</p>
    </div>
  );

  return (
    <div className="space-y-4">

      {!played ? (
        <p className="card p-5 text-center text-sm text-muted">
          Stats start rolling in once the first gameweek is scored.
        </p>
      ) : (
        <>
          {mvpPlayer && mvp ? (
            <div className="card flex flex-col items-center gap-2 p-5 text-center">
              <p className="flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-gold">
                <Sparkles className="h-3.5 w-3.5" /> League MVP
              </p>
              <PlayerPhoto photoCode={mvpPlayer.photoCode} name={mvpPlayer.webName} size={72} />
              <p className="font-display text-3xl leading-none">{mvpPlayer.webName}</p>
              <p className="text-xs text-muted">
                {mvp.points} pts for {mvp.squadOwner} · {mvpPlayer.clubShort}
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            {bestGw ? (
              <StatCard
                icon={TrendingUp}
                label="Best gameweek"
                value={String(bestGw.totalPoints)}
                detail={`${nameBySquad.get(bestGw.squadId) ?? '?'} · GW${bestGw.gw}`}
                tone="text-gold"
              />
            ) : null}
            {bestCaptain && bestCaptain.captainBonus > 0 ? (
              <StatCard
                icon={Crown}
                label="Captain masterclass"
                value={`+${bestCaptain.captainBonus}`}
                detail={`${nameBySquad.get(bestCaptain.squadId) ?? '?'} · GW${bestCaptain.gw}`}
              />
            ) : null}
            {benchHero && benchHero[1] > 0 ? (
              <StatCard
                icon={ShieldCheck}
                label="Bench saves"
                value={String(benchHero[1])}
                detail={`${nameBySquad.get(benchHero[0]) ?? '?'} rescued by autosubs`}
              />
            ) : null}
            <StatCard
              icon={Repeat}
              label="Trades done"
              value={String(executedTrades)}
              detail="executed league-wide"
            />
          </div>

          <div className="space-y-2">
            <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
              Season standings detail
            </p>
            <div className="card divide-y divide-[var(--line)] px-3">
              {table.map((r) => (
                <div key={r.userId} className="flex min-h-11 items-center gap-2 py-1.5 text-sm">
                  <span className="w-6 text-center font-display text-lg text-muted">{r.rank}</span>
                  <span className="min-w-0 flex-1 truncate font-bold">
                    {nameByUser.get(r.userId) ?? '?'}
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {r.gwWins} {r.gwWins === 1 ? 'win' : 'wins'} · {r.squadGoals} goals ·{' '}
                    {approvedCounts.get(r.userId) ?? 0} claims
                  </span>
                  <span className="w-12 shrink-0 text-right font-display text-xl tabular-nums">
                    {r.seasonTotal}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
