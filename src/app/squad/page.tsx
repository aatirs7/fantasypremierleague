import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { leagues, lineups, squads } from '@/lib/schema';
import { readSession } from '@/lib/auth';
import { myLeagues, resolveActiveLeagueId } from '@/lib/leagues';
import { editableGw, ensureLineup, playersByIds } from '@/lib/lineup';
import LineupEditor from '@/components/squad/LineupEditor';
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
      <div className="reveal space-y-4 py-4 text-center lg:mx-auto lg:max-w-2xl">
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

  if (!squad || league?.draftStatus !== 'complete') {
    return (
      <div className="reveal space-y-4 py-4 lg:mx-auto lg:max-w-2xl">
        <RememberLeague leagueId={leagueId} />
        <h1 className="text-center font-display text-4xl">Squad</h1>
        {switcher}
        <div className="card space-y-2 p-4 text-center">
          <p className="text-sm text-muted">
            {league?.draftStatus === 'active'
              ? 'Your draft is live right now.'
              : 'Your squad appears here after the draft.'}
          </p>
          <Link href={`/league/${leagueId}/draft`} className="inline-block font-bold text-accent">
            Go to the draft room
          </Link>
        </div>
      </div>
    );
  }

  const editable = await editableGw();
  if (!editable) {
    return (
      <div className="reveal space-y-4 py-4 lg:mx-auto lg:max-w-2xl">
        <h1 className="text-center font-display text-4xl">Squad</h1>
        <p className="text-sm text-muted">The season is over. See the league table for the final story.</p>
      </div>
    );
  }

  const picks = await ensureLineup(squad.id, editable.gw);
  if (!picks) {
    return (
      <div className="reveal space-y-4 py-4 lg:mx-auto lg:max-w-2xl">
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
    <div className="reveal space-y-4 py-4 lg:mx-auto lg:max-w-2xl">
      <RememberLeague leagueId={leagueId} />
      <div className="space-y-1 text-center">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
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
    </div>
  );
}
