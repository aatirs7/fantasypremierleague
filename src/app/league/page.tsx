import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { resolveActiveLeagueId } from '@/lib/leagues';

export const dynamic = 'force-dynamic';

// The League tab: bounce to the active league, or home to join one.
export default async function LeagueIndex() {
  const session = await readSession();
  if (!session) redirect('/?next=/league');
  const leagueId = await resolveActiveLeagueId(session.userId);
  redirect(leagueId ? `/league/${leagueId}` : '/home');
}
