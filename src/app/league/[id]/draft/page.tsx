import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { leagues } from '@/lib/schema';
import { readSession } from '@/lib/auth';
import { isLeagueMember } from '@/lib/leagues';
import { currentAdminId } from '@/lib/admin';
import DraftRoom from '@/components/draft/DraftRoom';

export const dynamic = 'force-dynamic';

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readSession();
  if (!session) redirect(`/?next=/league/${id}/draft`);

  const [league] = await db
    .select({ id: leagues.id })
    .from(leagues)
    .where(eq(leagues.id, id))
    .limit(1);
  if (!league) notFound();
  if (!(await isLeagueMember(session.userId, id))) notFound();

  const isAdmin = (await currentAdminId()) != null;
  return <DraftRoom leagueId={id} myUserId={session.userId} isAdmin={isAdmin} />;
}
