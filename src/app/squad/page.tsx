import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { leagues, lineups, squadPlayers, squads } from '@/lib/schema';
import { readSession } from '@/lib/auth';
import { myLeagues, resolveActiveLeagueId } from '@/lib/leagues';
import { editableGw, ensureLineup, playersByIds } from '@/lib/lineup';
import LineupEditor from '@/components/squad/LineupEditor';
import DraftBoardPitch from '@/components/squad/DraftBoardPitch';
import { QUOTAS, SQUAD_SIZE } from '@/lib/draft';
import Countdown from '@/components/leagues/Countdown';
import RememberLeague from '@/components/RememberLeague';

export const dynamic = 'force-dynamic';

export default async function SquadPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const session = await readSession();
  if (!session) redirect('/?next=/squad');
  const { league: explicit } = await searchParams;

  const leagueId = await resolveActiveLeagueId(session.userId, explicit);
  if (!leagueId) {
    return (
      <div className="reveal space-y-4 pb-4 pt-1 text-center lg:mx-auto lg:max-w-2xl">
        <h1 className="text-center font-display text-4xl">Squad</h1>
        <p className="text-sm text-muted">Join a league first, then draft your squad.</p>
        <Link href="/home" className="font-bold text-accent">
          Go home
        </Link>
      </div>
    );
  }

  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId)).limit(1);
  const [squad] = await db
    .select()
    .from(squads)
    .where(and(eq(squads.leagueId, leagueId), eq(squads.userId, session.userId)))
    .limit(1);
  const mine = await myLeagues(session.userId);

  const switcher =
    mine.length > 1 ? (
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-1.5">
          {mine.map((l) => (
            <Link
              key={l.id}
              href={`/squad?league=${l.id}`}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                l.id === leagueId
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-edge bg-white/[0.02] text-muted'
              }`}
            >
              {l.name}
            </Link>
          ))}
        </div>
      </div>
    ) : null;

  // Mid-draft: no lineup exists yet, so show the squad taking shape instead
  // of an empty stub. Filled plates for who you have, dashed outlines for
  // what you still owe.
  if (squad && league?.draftStatus === 'active') {
    const owned = await db
      .select({ fplId: squadPlayers.fplId })
      .from(squadPlayers)
      .where(and(eq(squadPlayers.squadId, squad.id), isNull(squadPlayers.droppedGw)));
    const drafted = owned.length ? await playersByIds(owned.map((o) => o.fplId)) : [];
    const need = SQUAD_SIZE - drafted.length;
    return (
      <div className="reveal space-y-4 pb-4 pt-1 lg:mx-auto lg:max-w-2xl">
        <RememberLeague leagueId={leagueId} />
        <div className="space-y-1 text-center">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
            {league.name}
          </p>
          <h1 className="font-display text-4xl">Draft in progress</h1>
          <p className="text-xs text-muted tabular-nums">
            {drafted.length} of {SQUAD_SIZE} picked
            {need > 0 ? ` · ${need} to go` : ' · squad complete'}
          </p>
        </div>
        {switcher}
        <div className="grid grid-cols-4 gap-2">
          {(['GK', 'DEF', 'MID', 'FWD'] as const).map((pos) => {
            const have = drafted.filter((p) => p.position === pos).length;
            const short = QUOTAS[pos] - have;
            return (
              <div
                key={pos}
                className={`rounded-xl border px-1.5 py-2 text-center ${
                  short === 0 ? 'border-edge opacity-50' : 'border-accent/40 bg-accent/[0.06]'
                }`}
              >
                <p className="text-[0.55rem] font-bold uppercase tracking-wider text-muted-2">
                  {pos}
                </p>
                <p className="mt-0.5 text-lg font-semibold leading-none tabular-nums">
                  {have}
                  <span className="text-xs text-muted-2">/{QUOTAS[pos]}</span>
                </p>
                <p className="mt-0.5 text-[0.55rem] font-semibold text-muted">
                  {short === 0 ? 'full' : `need ${short}`}
                </p>
              </div>
            );
          })}
        </div>
        <DraftBoardPitch players={drafted} />
        <Link href={`/draft?league=${leagueId}`} className="btn-primary w-full">
          Back to the draft room
        </Link>
      </div>
    );
  }

  if (!squad || league?.draftStatus !== 'complete') {
    return (
      <div className="reveal space-y-4 pb-4 pt-1 lg:mx-auto lg:max-w-2xl">
        <RememberLeague leagueId={leagueId} />
        <h1 className="text-center font-display text-4xl">Squad</h1>
        {switcher}
        <div className="card space-y-2 p-4 text-center">
          <p className="text-sm text-muted">Your squad appears here after the draft.</p>
          <Link href={`/draft?league=${leagueId}`} className="inline-block font-bold text-accent">
            Go to the draft room
          </Link>
        </div>
      </div>
    );
  }

  const editable = await editableGw();
  if (!editable) {
    return (
      <div className="reveal space-y-4 pb-4 pt-1 lg:mx-auto lg:max-w-2xl">
        <h1 className="text-center font-display text-4xl">Squad</h1>
        <p className="text-sm text-muted">The season is over. See the league table for the final story.</p>
      </div>
    );
  }

  const picks = await ensureLineup(squad.id, editable.gw);
  if (!picks) {
    return (
      <div className="reveal space-y-4 pb-4 pt-1 lg:mx-auto lg:max-w-2xl">
        <h1 className="text-center font-display text-4xl">Squad</h1>
        <p className="text-sm text-muted">Squad incomplete. Finish the draft first.</p>
      </div>
    );
  }
  const players = await playersByIds(picks.map((p) => p.fplId));
  const [row] = await db
    .select({ autoSet: lineups.autoSet })
    .from(lineups)
    .where(and(eq(lineups.squadId, squad.id), eq(lineups.gw, editable.gw)))
    .limit(1);

  return (
    <div className="reveal space-y-4 pb-4 pt-1 lg:mx-auto lg:max-w-2xl">
      <RememberLeague leagueId={leagueId} />
      <div className="space-y-1 text-center">
        <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
          {league.name}
        </p>
        <h1 className="font-display text-4xl">Gameweek {editable.gw}</h1>
        <p className="text-xs text-muted">
          Locks in{' '}
          <span className="font-bold text-foreground">
            <Countdown toIso={editable.deadline.toISOString()} doneText="Locked" />
          </span>
        </p>
      </div>
      {switcher}
      <LineupEditor
        squadId={squad.id}
        gw={editable.gw}
        initial={picks}
        players={players}
        autoSet={row?.autoSet ?? true}
      />
      {/* Squad surgery lives below the pitch: you decide the XI first, then
          go looking for a new player. */}
      <div className="flex justify-center gap-2 pt-1">
        <Link href={`/league/${leagueId}/trades`} className="btn-outline min-h-10 flex-1 text-xs">
          Trades
        </Link>
        <Link href={`/league/${leagueId}/waivers`} className="btn-outline min-h-10 flex-1 text-xs">
          Waivers
        </Link>
      </div>
    </div>
  );
}
