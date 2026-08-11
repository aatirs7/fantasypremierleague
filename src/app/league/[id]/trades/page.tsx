import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { readSession } from '@/lib/auth';
import { isLeagueMember } from '@/lib/leagues';
import TradeHub from '@/components/trades/TradeHub';

export const dynamic = 'force-dynamic';

export default async function TradesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readSession();
  if (!session) redirect(`/?next=/league/${id}/trades`);
  if (!(await isLeagueMember(session.userId, id))) notFound();

  return (
    <div className="reveal space-y-4 py-4 lg:mx-auto lg:max-w-2xl">
      <Link href={`/league/${id}`} className="flex items-center gap-1 text-sm font-semibold text-muted">
        <ArrowLeft className="h-4 w-4" /> League
      </Link>
      <h1 className="font-display text-4xl">Trades</h1>
      <TradeHub leagueId={id} myUserId={session.userId} />
    </div>
  );
}
