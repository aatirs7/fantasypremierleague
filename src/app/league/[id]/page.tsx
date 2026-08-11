import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { Swords, Users } from 'lucide-react';
import { db } from '@/lib/db';
import { leagues } from '@/lib/schema';
import { readSession } from '@/lib/auth';
import { MIN_MANAGERS, isLeagueMember, leagueMemberList } from '@/lib/leagues';
import InviteShare from '@/components/leagues/InviteShare';
import Countdown from '@/components/leagues/Countdown';
import ScheduleDraft from '@/components/leagues/ScheduleDraft';
import RememberLeague from '@/components/RememberLeague';
import PullToRefresh from '@/components/PullToRefresh';

export const dynamic = 'force-dynamic';

export default async function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readSession();
  if (!session) redirect(`/?next=/league/${id}`);

  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1);
  if (!league) notFound();
  if (!(await isLeagueMember(session.userId, league.id))) notFound();

  const members = await leagueMemberList(league.id);
  const isOwner = league.ownerId === session.userId;
  const pending = league.draftStatus === 'pending';

  return (
    <div className="reveal space-y-4 py-4 lg:mx-auto lg:max-w-2xl">
      <PullToRefresh />
      <RememberLeague leagueId={league.id} />

      <div>
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">League</p>
        <h1 className="font-display text-4xl">{league.name}</h1>
        {league.isTest ? (
          <p className="mt-1 inline-block rounded-full bg-gold/20 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-gold">
            Test mode
          </p>
        ) : null}
      </div>

      {pending ? (
        <>
          <div className="card space-y-1 p-4">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Draft</p>
            {league.draftTime ? (
              <>
                <p className="font-display text-3xl">
                  <Countdown toIso={league.draftTime.toISOString()} doneText="It is draft time" />
                </p>
                <p className="text-xs text-muted">
                  {new Date(league.draftTime).toLocaleString('en-GB', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted">
                Not scheduled yet.{isOwner ? ' Pick a time below.' : ' The owner will pick a time.'}
              </p>
            )}
            <Link
              href={`/league/${league.id}/draft`}
              className="mt-2 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-[var(--accent-ink)] active:scale-95"
            >
              <Swords className="h-4 w-4" />
              Enter draft room
            </Link>
            {members.length < MIN_MANAGERS ? (
              <p className="pt-1 text-xs text-muted">
                You need at least {MIN_MANAGERS} managers to draft. {members.length} joined so far.
              </p>
            ) : null}
          </div>
          {isOwner ? (
            <ScheduleDraft leagueId={league.id} currentIso={league.draftTime?.toISOString() ?? null} />
          ) : null}
          <InviteShare code={league.joinCode} leagueName={league.name} />
        </>
      ) : league.draftStatus === 'active' ? (
        <Link
          href={`/league/${league.id}/draft`}
          className="your-pick card flex min-h-14 items-center justify-center gap-2 p-4 text-lg font-bold active:scale-[0.99]"
        >
          <Swords className="h-5 w-5" />
          Draft is LIVE, jump in
        </Link>
      ) : (
        <div className="card p-4 text-sm text-muted">
          Table and scores land here once scoring ships.
        </div>
      )}

      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
          <Users className="h-3.5 w-3.5" />
          Managers ({members.length})
        </p>
        {members.map((m) => (
          <div key={m.userId} className="card flex min-h-12 items-center gap-3 px-3 py-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.04] text-sm font-bold text-muted">
              {m.username.slice(0, 1).toUpperCase()}
            </span>
            <span className="flex-1 truncate text-sm font-semibold">
              {m.username}
              {m.userId === session.userId ? (
                <span className="ml-2 rounded-full bg-accent px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider text-[var(--accent-ink)]">
                  You
                </span>
              ) : null}
              {m.isBot ? (
                <span className="ml-2 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider text-muted">
                  Bot
                </span>
              ) : null}
            </span>
            {m.userId === league.ownerId ? (
              <span className="text-[0.6rem] font-bold uppercase tracking-wider text-gold">Owner</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
