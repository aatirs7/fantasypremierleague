import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { readSession } from '@/lib/auth';
import { isLeagueMember } from '@/lib/leagues';
import WaiversHub from '@/components/waivers/WaiversHub';

export const dynamic = 'force-dynamic';

export default async function WaiversPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readSession();
  if (!session) redirect(`/?next=/league/${id}/waivers`);
  if (!(await isLeagueMember(session.userId, id))) notFound();

  return (
    <div className="reveal space-y-4 py-4 lg:mx-auto lg:max-w-2xl">
      <Link href={`/league/${id}`} className="flex items-center gap-1 text-sm font-semibold text-muted">
        <ArrowLeft className="h-4 w-4" /> League
      </Link>
      <h1 className="font-display text-4xl">Waivers</h1>
      <WaiversHub leagueId={id} myUserId={session.userId} />
    </div>
  );
}
