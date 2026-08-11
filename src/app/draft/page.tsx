import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { resolveActiveLeagueId } from '@/lib/leagues';

export const dynamic = 'force-dynamic';

// The Draft tab: straight into the active league's draft room (live room,
// lobby, or recap depending on status), or home to join a league first.
export default async function DraftIndex() {
  const session = await readSession();
  if (!session) redirect('/?next=/draft');
  const leagueId = await resolveActiveLeagueId(session.userId);
  redirect(leagueId ? `/league/${leagueId}/draft` : '/home');
}
