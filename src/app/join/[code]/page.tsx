import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq, sql, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { leagueMembers, leagues } from '@/lib/schema';
import { readSession } from '@/lib/auth';
import { MAX_MANAGERS } from '@/lib/leagues';
import Onboard from '@/components/auth/Onboard';

export const dynamic = 'force-dynamic';

// Invite-link landing: signed-in users join in one tap; anonymous visitors
// get the sign-in flow and come back here after.
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).trim().toUpperCase();
  const [league] = await db.select().from(leagues).where(eq(leagues.joinCode, code)).limit(1);

  if (!league) {
    return (
      <div className="card mx-auto mt-16 max-w-sm space-y-2 p-6 text-center">
        <h1 className="font-display text-3xl">Invite not found</h1>
        <p className="text-sm text-muted">That code does not match any league. Check the link and try again.</p>
        <Link href="/" className="inline-block pt-2 text-sm font-bold text-accent">
          Go home
        </Link>
      </div>
    );
  }

  const session = await readSession();
  if (!session) {
    return (
      <div className="space-y-4">
        <div className="card mx-auto mt-6 max-w-sm p-4 text-center">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">You are invited to</p>
          <p className="font-display text-3xl">{league.name}</p>
          <p className="mt-1 text-xs text-muted">Sign in or create an account to join.</p>
        </div>
        <Onboard next={`/join/${code}`} />
      </div>
    );
  }

  if (league.draftStatus !== 'pending') {
    return (
      <div className="card mx-auto mt-16 max-w-sm space-y-2 p-6 text-center">
        <h1 className="font-display text-3xl">Too late</h1>
        <p className="text-sm text-muted">This league has already drafted, so joining is closed.</p>
        <Link href="/home" className="inline-block pt-2 text-sm font-bold text-accent">
          Go home
        </Link>
      </div>
    );
  }

  const already = await db
    .select({ userId: leagueMembers.userId })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, league.id), eq(leagueMembers.userId, session.userId)))
    .limit(1);
  if (already.length === 0) {
    const [count] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(leagueMembers)
      .where(eq(leagueMembers.leagueId, league.id));
    if ((count?.n ?? 0) >= MAX_MANAGERS) {
      return (
        <div className="card mx-auto mt-16 max-w-sm space-y-2 p-6 text-center">
          <h1 className="font-display text-3xl">League full</h1>
          <p className="text-sm text-muted">This league already has {MAX_MANAGERS} managers.</p>
          <Link href="/home" className="inline-block pt-2 text-sm font-bold text-accent">
            Go home
          </Link>
        </div>
      );
    }
    await db
      .insert(leagueMembers)
      .values({ leagueId: league.id, userId: session.userId })
      .onConflictDoNothing();
  }
  redirect(`/league/${league.id}`);
}
