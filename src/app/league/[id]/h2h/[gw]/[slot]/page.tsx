import { notFound, redirect } from 'next/navigation';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  fplPlayers,
  gwPlayerPoints,
  gwScores,
  leagues,
  lineups,
  matchups,
  squadPlayers,
  squads,
  users,
} from '@/lib/schema';
import { readSession } from '@/lib/auth';
import { isLeagueMember } from '@/lib/leagues';
import Avatar from '@/components/Avatar';
import BackButton from '@/components/BackButton';
import PlayerPhoto from '@/components/players/PlayerPhoto';

export const dynamic = 'force-dynamic';

const ROUND_LABEL: Record<string, string> = {
  regular: 'Head to head',
  semi: 'Semi-final',
  final: 'Final',
  third: 'Third place',
};

type SidePlayer = {
  fplId: number;
  webName: string;
  clubShort: string;
  position: string;
  photoCode: number | null;
  points: number;
  captain: boolean;
  vice: boolean;
};

type Side = {
  userId: string;
  username: string;
  total: number;
  live: boolean;
  players: SidePlayer[];
};

// One fixture, both XIs, player by player. The number on the league page is
// a score; this is the story behind it.
export default async function H2HDetail({
  params,
}: {
  params: Promise<{ id: string; gw: string; slot: string }>;
}) {
  const { id: leagueId, gw: gwRaw, slot: slotRaw } = await params;
  const session = await readSession();
  if (!session) redirect(`/?next=/league/${leagueId}`);
  if (!(await isLeagueMember(session.userId, leagueId))) notFound();
  const gw = Number(gwRaw);
  const slot = Number(slotRaw);
  if (!Number.isInteger(gw) || !Number.isInteger(slot)) notFound();

  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId)).limit(1);
  const [fixture] = await db
    .select()
    .from(matchups)
    .where(and(eq(matchups.leagueId, leagueId), eq(matchups.gw, gw), eq(matchups.slot, slot)))
    .limit(1);
  if (!league || !fixture) notFound();

  const userIds = [fixture.homeUserId, fixture.awayUserId].filter(Boolean) as string[];
  const nameRows = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.id, userIds));
  const nameOf = new Map(nameRows.map((n) => [n.id, n.username]));

  const squadRows = await db
    .select({ id: squads.id, userId: squads.userId })
    .from(squads)
    .where(and(eq(squads.leagueId, leagueId), inArray(squads.userId, userIds)));
  const squadIds = squadRows.map((s) => s.id);

  const [lineupRows, scoreRows] = await Promise.all([
    squadIds.length
      ? db.select().from(lineups).where(and(inArray(lineups.squadId, squadIds), eq(lineups.gw, gw)))
      : Promise.resolve([]),
    squadIds.length
      ? db
          .select()
          .from(gwScores)
          .where(and(inArray(gwScores.squadId, squadIds), eq(gwScores.gw, gw)))
      : Promise.resolve([]),
  ]);

  const ownedRows = squadIds.length
    ? await db
        .select({ squadId: squadPlayers.squadId, fplId: squadPlayers.fplId })
        .from(squadPlayers)
        .where(and(inArray(squadPlayers.squadId, squadIds), isNull(squadPlayers.droppedGw)))
    : [];

  const allIds = [
    ...new Set([...lineupRows.flatMap((l) => l.picks.map((p) => p.fplId)), ...ownedRows.map((o) => o.fplId)]),
  ];
  const [infoRows, pointRows] = await Promise.all([
    allIds.length
      ? db
          .select({
            fplId: fplPlayers.fplId,
            webName: fplPlayers.webName,
            clubShort: fplPlayers.clubShort,
            position: fplPlayers.position,
            photoCode: fplPlayers.photoCode,
          })
          .from(fplPlayers)
          .where(inArray(fplPlayers.fplId, allIds))
      : Promise.resolve([]),
    allIds.length
      ? db
          .select({ fplId: gwPlayerPoints.fplId, totalPoints: gwPlayerPoints.totalPoints })
          .from(gwPlayerPoints)
          .where(and(eq(gwPlayerPoints.gw, gw), inArray(gwPlayerPoints.fplId, allIds)))
      : Promise.resolve([]),
  ]);
  const infoOf = new Map(infoRows.map((p) => [p.fplId, p]));
  const ptsOf = new Map(pointRows.map((p) => [p.fplId, p.totalPoints]));

  const buildSide = (userId: string): Side => {
    const squad = squadRows.find((s) => s.userId === userId);
    const lineup = lineupRows.find((l) => l.squadId === squad?.id);
    const score = scoreRows.find((s) => s.squadId === squad?.id);
    const picks = lineup?.picks.filter((p) => p.starting) ?? [];
    // Before the first deadline there is no lineup yet, so fall back to the
    // drafted roster rather than showing an empty column.
    const players: SidePlayer[] = picks.length
      ? picks
          .slice()
          .sort((a, b) => a.slot - b.slot)
          .map((p) => {
            const info = infoOf.get(p.fplId);
            const raw = ptsOf.get(p.fplId) ?? 0;
            return {
              fplId: p.fplId,
              webName: info?.webName ?? `#${p.fplId}`,
              clubShort: info?.clubShort ?? '',
              position: info?.position ?? '',
              photoCode: info?.photoCode ?? null,
              points: p.isCaptain ? raw * 2 : raw,
              captain: p.isCaptain,
              vice: p.isVice,
            };
          })
      : ownedRows
          .filter((o) => o.squadId === squad?.id)
          .map((o) => {
            const info = infoOf.get(o.fplId);
            return {
              fplId: o.fplId,
              webName: info?.webName ?? `#${o.fplId}`,
              clubShort: info?.clubShort ?? '',
              position: info?.position ?? '',
              photoCode: info?.photoCode ?? null,
              points: 0,
              captain: false,
              vice: false,
            };
          });
    const settledTotal =
      userId === fixture.homeUserId ? (fixture.homePoints ?? 0) : (fixture.awayPoints ?? 0);
    return {
      userId,
      username: nameOf.get(userId) ?? 'Unknown',
      total: fixture.settled ? settledTotal : (score?.totalPoints ?? 0),
      live: !!score && !score.final,
      players,
    };
  };

  const home = buildSide(fixture.homeUserId);
  const away = fixture.awayUserId ? buildSide(fixture.awayUserId) : null;
  const homeWin = away ? home.total > away.total : false;
  const awayWin = away ? away.total > home.total : false;

  const Column = ({ side, win }: { side: Side; win: boolean }) => (
    <div className="min-w-0 flex-1">
      <div className="flex flex-col items-center gap-1.5 pb-3 text-center">
        <Avatar name={side.username} size={44} ring={win} />
        <p className="w-full truncate text-sm font-semibold">
          {side.username}
          {side.userId === session.userId ? (
            <span className="ml-1 text-[0.55rem] font-bold text-accent">YOU</span>
          ) : null}
        </p>
      </div>
      <div className="divide-y divide-[var(--line)]">
        {side.players.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-2">No lineup</p>
        ) : (
          side.players.map((p) => (
            <div key={p.fplId} className="flex min-h-10 items-center gap-1.5 py-1.5">
              <PlayerPhoto photoCode={p.photoCode} name={p.webName} size={22} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.7rem] font-semibold leading-tight">
                  {p.webName}
                  {p.captain ? <span className="ml-1 text-[0.55rem] text-gold">C</span> : null}
                  {p.vice ? <span className="ml-1 text-[0.55rem] text-silver">V</span> : null}
                </span>
                <span className="block text-[0.55rem] leading-tight text-muted-2">
                  {p.clubShort} · {p.position}
                </span>
              </span>
              <span className="shrink-0 text-xs font-semibold tabular-nums">{p.points}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="reveal space-y-4 pb-6 pt-1 lg:mx-auto lg:max-w-2xl">
      <BackButton fallback={`/league/${leagueId}`} label={league.name} />

      <header className="text-center">
        <p className="text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
          {ROUND_LABEL[fixture.round] ?? fixture.round} · Gameweek {gw}
        </p>
        <div className="mt-2 flex items-center justify-center gap-4">
          <span className={`font-display text-5xl tabular-nums ${homeWin ? 'text-accent' : ''}`}>
            {home.total}
          </span>
          <span className="text-sm text-muted-2">v</span>
          <span className={`font-display text-5xl tabular-nums ${awayWin ? 'text-accent' : ''}`}>
            {away ? away.total : '-'}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">
          {!away
            ? `${home.username} has a bye`
            : fixture.settled
              ? 'Final'
              : home.live || away.live
                ? 'Live'
                : 'Not started'}
        </p>
      </header>

      {away ? (
        <div className="tile flex gap-3 p-3">
          <Column side={home} win={homeWin} />
          <div className="w-px shrink-0 bg-[var(--line)]" />
          <Column side={away} win={awayWin} />
        </div>
      ) : (
        <div className="tile p-3">
          <Column side={home} win={false} />
        </div>
      )}
    </div>
  );
}
