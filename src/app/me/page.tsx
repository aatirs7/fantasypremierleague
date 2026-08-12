import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Share, Sparkles } from 'lucide-react';
import { readSession } from '@/lib/auth';
import { myLeagues } from '@/lib/leagues';
import SignOutButton from '@/components/auth/SignOutButton';
import LeagueActions from '@/components/leagues/LeagueActions';
import InviteShare from '@/components/leagues/InviteShare';

export const dynamic = 'force-dynamic';

export default async function MePage() {
  const session = await readSession();
  if (!session) redirect('/?next=/me');
  const mine = await myLeagues(session.userId);

  return (
    <div className="reveal space-y-7 pb-4 pt-1 lg:mx-auto lg:max-w-2xl">
      <header className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent font-display text-3xl text-[var(--accent-ink)]">
          {session.username.slice(0, 1).toUpperCase()}
        </span>
        <h1 className="font-display text-3xl leading-none">{session.username}</h1>
        <p className="text-xs text-muted">Remember your PIN, there is no reset.</p>
      </header>

      <section className="space-y-3">
        <p className="text-center text-[0.7rem] font-bold uppercase tracking-[0.2em] text-muted">
          My leagues
        </p>
        {mine.length === 0 ? (
          <p className="text-center text-sm text-muted">
            You are not in a league yet. Create or join one below.
          </p>
        ) : (
          mine.map((l) => (
            <div key={l.id} className="card space-y-3 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate font-display text-lg leading-none">
                  {l.name}
                </span>
                <Link
                  href={`/league/${l.id}`}
                  className="shrink-0 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent active:scale-95"
                >
                  Open
                </Link>
              </div>
              <InviteShare code={l.joinCode} leagueName={l.name} />
            </div>
          ))
        )}
      </section>

      <section className="space-y-3">
        <p className="text-center text-[0.7rem] font-bold uppercase tracking-[0.2em] text-muted">
          Start or join a league
        </p>
        <LeagueActions />
      </section>

      <section className="space-y-3">
        <div className="space-y-1 text-center">
          <div className="flex items-center justify-center gap-1.5 text-accent">
            <Sparkles className="h-4 w-4" strokeWidth={2.4} />
            <span className="text-[0.7rem] font-bold uppercase tracking-[0.2em]">Best experience</span>
          </div>
          <h2 className="font-display text-2xl leading-none">Add it to your home screen</h2>
        </div>
        <div className="card flex flex-col items-center gap-2 p-4 text-center">
          <Share className="h-4 w-4 shrink-0 text-muted" />
          <p className="text-xs text-muted">
            Open the browser share menu and tap &quot;Add to Home Screen&quot; for the full-screen,
            app-like experience.
          </p>
        </div>
      </section>

      <SignOutButton />
    </div>
  );
}
