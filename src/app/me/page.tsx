import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight, Share, Trophy } from 'lucide-react';
import { readSession } from '@/lib/auth';
import { myLeagues } from '@/lib/leagues';
import SignOutButton from '@/components/auth/SignOutButton';

export const dynamic = 'force-dynamic';

export default async function MePage() {
  const session = await readSession();
  if (!session) redirect('/?next=/me');
  const mine = await myLeagues(session.userId);

  return (
    <div className="reveal space-y-4 py-4 lg:mx-auto lg:max-w-2xl">
      <h1 className="text-center font-display text-4xl">Me</h1>
      <div className="card p-4">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Signed in as</p>
        <p className="mt-1 text-xl font-bold">{session.username}</p>
        <p className="mt-2 text-xs text-muted">Remember your PIN, there is no reset.</p>
      </div>

      {mine.length ? (
        <div className="space-y-2">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">My leagues</p>
          {mine.map((l) => (
            <Link
              key={l.id}
              href={`/league/${l.id}`}
              className="card flex min-h-12 items-center gap-3 px-4 active:scale-[0.99]"
            >
              <Trophy className="h-4 w-4 shrink-0 text-accent" />
              <span className="flex-1 truncate text-sm font-semibold">{l.name}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-2" />
            </Link>
          ))}
        </div>
      ) : null}

      <div className="card flex items-start gap-3 p-4">
        <Share className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
        <p className="text-xs text-muted">
          Add this app to your home screen for the full experience: open the browser share menu and
          tap &quot;Add to Home Screen&quot;.
        </p>
      </div>

      <SignOutButton />
    </div>
  );
}
