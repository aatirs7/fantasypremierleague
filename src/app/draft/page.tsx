import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { leagues } from '@/lib/schema';
import { readSession } from '@/lib/auth';
import { isLeagueMember, resolveActiveLeagueId } from '@/lib/leagues';
import { currentAdminId } from '@/lib/admin';
import DraftRoom from '@/components/draft/DraftRoom';

export const dynamic = 'force-dynamic';

// The Draft tab renders the room directly (no redirect), so the tab stays
// highlighted and re-taps are no-ops. ?league= picks a specific league;
// otherwise the active league.
export default async function DraftPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const session = await readSession();
  if (!session) redirect('/?next=/draft');
  const { league: explicit } = await searchParams;

  const leagueId = await resolveActiveLeagueId(session.userId, explicit);
  if (!leagueId) redirect('/home');

  const [league] = await db
    .select({ id: leagues.id })
    .from(leagues)
    .where(eq(leagues.id, leagueId))
    .limit(1);
  if (!league || !(await isLeagueMember(session.userId, leagueId))) redirect('/home');

  const isAdmin = (await currentAdminId()) != null;
  return <DraftRoom leagueId={leagueId} myUserId={session.userId} isAdmin={isAdmin} />;
}
