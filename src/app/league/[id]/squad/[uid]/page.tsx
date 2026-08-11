import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { ArrowLeft, Crown, Shield } from 'lucide-react';
import { db } from '@/lib/db';
import {
  fplPlayers,
  gameweeks,
  gwPlayerPoints,
  gwScores,
  leagues,
  lineups,
  seasonScores,
  squads,
  users,
} from '@/lib/schema';
import { readSession } from '@/lib/auth';
import { isLeagueMember } from '@/lib/leagues';
import { squadContributions } from '@/lib/contributions';
import { isNull } from 'drizzle-orm';
import { squadPlayers } from '@/lib/schema';
import PlayerPhoto from '@/components/players/PlayerPhoto';

export const dynamic = 'force-dynamic';

const POS_CLS: Record<string, string> = {
  GK: 'bg-gold/15 text-gold',
  DEF: 'bg-silver/15 text-silver',
  MID: 'bg-accent/15 text-accent',
  FWD: 'bg-[#38bdf8]/15 text-[#38bdf8]',
};

// Any manager's squad, visible to everyone in the league: current lineup
// with per-player GW points, season history, and the autosub log.
export default async function SquadViewPage({
  params,
}: {
  params: Promise<{ id: string; uid: string }>;
}) {
  const { id: leagueId, uid } = await params;
  const session = await readSession();
  if (!session) redirect(`/?next=/league/${leagueId}/squad/${uid}`);
  if (!(await isLeagueMember(session.userId, leagueId))) notFound();

  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId)).limit(1);
  const [owner] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
  const [squad] = await db
    .select()
    .from(squads)
    .where(and(eq(squads.leagueId, leagueId), eq(squads.userId, uid)))
    .limit(1);
  if (!league || !owner || !squad) notFound();

  const [season] = await db
    .select()
    .from(seasonScores)
    .where(eq(seasonScores.squadId, squad.id))
    .limit(1);

  // Display GW: the latest one this squad has a lineup for.
  const lineupRows = await db
    .select()
    .from(lineups)
    .where(eq(lineups.squadId, squad.id))
    .orderBy(desc(lineups.gw))
    .limit(1);
  const lineup = lineupRows[0] ?? null;

  const history = await db
    .select()
    .from(gwScores)
    .where(eq(gwScores.squadId, squad.id))
    .orderBy(desc(gwScores.gw))
    .limit(38);

  let starters: { fplId: number; slot: number; isCaptain: boolean; isVice: boolean }[] = [];
  let bench: typeof starters = [];
  let playerById = new Map<
    number,
    { fplId: number; photoCode: number | null; webName: string; position: string; clubShort: string }
  >();
  let pointsById = new Map<number, number>();
  if (lineup) {
    starters = lineup.picks.filter((p) => p.starting).sort((a, b) => a.slot - b.slot);
    bench = lineup.picks.filter((p) => !p.starting).sort((a, b) => a.slot - b.slot);
    const ids = lineup.picks.map((p) => p.fplId);
    const players = await db
      .select({
        fplId: fplPlayers.fplId,
        photoCode: fplPlayers.photoCode,
        webName: fplPlayers.webName,
        position: fplPlayers.position,
        clubShort: fplPlayers.clubShort,
      })
      .from(fplPlayers)
      .where(inArray(fplPlayers.fplId, ids));
    playerById = new Map(players.map((p) => [p.fplId, p]));
    const pts = await db
      .select({ fplId: gwPlayerPoints.fplId, totalPoints: gwPlayerPoints.totalPoints })
      .from(gwPlayerPoints)
      .where(and(eq(gwPlayerPoints.gw, lineup.gw), inArray(gwPlayerPoints.fplId, ids)));
    pointsById = new Map(pts.map((p) => [p.fplId, p.totalPoints]));
  }

  const gwNames = new Map(
    (await db.select({ gw: gameweeks.gw, name: gameweeks.name }).from(gameweeks)).map((g) => [
      g.gw,
      g.name,
    ]),
  );

  const autosubName = (fplId: number) => playerById.get(fplId)?.webName ?? `#${fplId}`;

  const Row = ({ pick }: { pick: (typeof starters)[number] }) => {
    const p = playerById.get(pick.fplId);
    if (!p) return null;
    const pts = pointsById.get(pick.fplId);
    return (
      <div className="flex min-h-11 items-center gap-2 py-1.5">
        <PlayerPhoto photoCode={p.photoCode} name={p.webName} size={30} />
        <span className={`rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold ${POS_CLS[p.position] ?? ''}`}>
          {p.position}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {p.webName}
          <span className="ml-1.5 text-xs text-muted">{p.clubShort}</span>
        </span>
        {pick.isCaptain ? <Crown className="h-3.5 w-3.5 shrink-0 text-gold" /> : null}
        {pick.isVice ? <Shield className="h-3.5 w-3.5 shrink-0 text-silver" /> : null}
        <span className="shrink-0 text-sm font-bold tabular-nums text-accent">
          {pts != null ? `${pts} pts` : '-'}
        </span>
      </div>
    );
  };

  return (
    <div className="reveal space-y-4 py-4 lg:mx-auto lg:max-w-2xl">
      <Link href={`/league/${leagueId}`} className="flex items-center gap-1 text-sm font-semibold text-muted">
        <ArrowLeft className="h-4 w-4" /> {league.name}
      </Link>

      <div className="space-y-1 text-center">
        <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Squad</p>
        <h1 className="font-display text-4xl">{owner.username}</h1>
        <p className="font-display text-2xl tabular-nums text-accent">
          {season?.totalPoints ?? 0}
          <span className="ml-1.5 text-[0.6rem] font-bold uppercase tracking-wider text-muted-2">
            season pts
          </span>
        </p>
      </div>

      {lineup ? (
        <>
          <div className="card px-3 py-2">
            <p className="pb-1 pt-1 text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
              {gwNames.get(lineup.gw) ?? `Gameweek ${lineup.gw}`} lineup
            </p>
            <div className="divide-y divide-[var(--line)]">
              {starters.map((p) => (
                <Row key={p.fplId} pick={p} />
              ))}
            </div>
            <p className="pt-2 text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Bench</p>
            <div className="divide-y divide-[var(--line)] opacity-70">
              {bench.map((p) => (
                <Row key={p.fplId} pick={p} />
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="card p-4 text-sm text-muted">No lineup yet.</p>
      )}

      <Contributions squadId={squad.id} leagueId={leagueId} />

      {history.length ? (
        <div className="space-y-2">
          <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
            Gameweek history
          </p>
          <div className="card divide-y divide-[var(--line)] px-3">
            {history.map((h) => (
              <div key={h.gw} className="py-2">
                <div className="flex min-h-9 items-center gap-3">
                  <span className="w-12 text-xs font-bold text-muted">GW{h.gw}</span>
                  <span className="flex-1 text-xs text-muted">
                    {h.rawPoints} raw
                    {h.captainBonus ? ` + ${h.captainBonus} captain` : ''}
                    {!h.final ? (
                      <span className="ml-1.5 text-[0.55rem] font-bold uppercase tracking-wider text-live">
                        live
                      </span>
                    ) : null}
                  </span>
                  <span className="font-display text-xl tabular-nums">{h.totalPoints}</span>
                </div>
                {h.autosubs.length ? (
                  <p className="pb-1 pl-12 text-[0.65rem] text-muted-2">
                    Autosubs:{' '}
                    {h.autosubs
                      .map((a) => `${autosubName(a.inFplId)} in for ${autosubName(a.outFplId)}`)
                      .join(', ')}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Who has actually earned this squad its points: every current player with
// the points they contributed while counting in the XI (captain doubling
// attributed to whoever doubled), plus weeks counted.
async function Contributions({ squadId, leagueId }: { squadId: string; leagueId: string }) {
  const contrib = await squadContributions(squadId);
  if (contrib.size === 0) return null;

  const current = await db
    .select({ fplId: squadPlayers.fplId })
    .from(squadPlayers)
    .where(
      and(
        eq(squadPlayers.squadId, squadId),
        eq(squadPlayers.leagueId, leagueId),
        isNull(squadPlayers.droppedGw),
      ),
    );
  const ids = [...new Set([...current.map((c) => c.fplId), ...contrib.keys()])];
  const players = await db
    .select({
      fplId: fplPlayers.fplId,
      photoCode: fplPlayers.photoCode,
      webName: fplPlayers.webName,
      position: fplPlayers.position,
      clubShort: fplPlayers.clubShort,
    })
    .from(fplPlayers)
    .where(inArray(fplPlayers.fplId, ids));
  const byId = new Map(players.map((p) => [p.fplId, p]));
  const currentSet = new Set(current.map((c) => c.fplId));

  const rows = ids
    .map((id) => ({
      p: byId.get(id),
      c: contrib.get(id) ?? { fplId: id, points: 0, weeks: 0 },
      onSquad: currentSet.has(id),
    }))
    .filter((r) => r.p && (r.onSquad || r.c.points !== 0))
    .sort((a, b) => b.c.points - a.c.points);

  return (
    <div className="space-y-2">
      <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
        Points for this squad
      </p>
      <div className="card divide-y divide-[var(--line)] px-3">
        {rows.map(({ p, c, onSquad }) => (
          <div key={p!.fplId} className={`flex min-h-11 items-center gap-2 py-1.5 ${onSquad ? '' : 'opacity-50'}`}>
            <PlayerPhoto photoCode={p!.photoCode} name={p!.webName} size={30} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {p!.webName}
              <span className="ml-1.5 text-xs text-muted">
                {p!.clubShort}
                {onSquad ? '' : ' · departed'}
              </span>
            </span>
            <span className="shrink-0 text-xs text-muted">
              {c.weeks} {c.weeks === 1 ? 'week' : 'weeks'}
            </span>
            <span className="w-14 shrink-0 text-right font-display text-xl tabular-nums text-accent">
              {c.points}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
