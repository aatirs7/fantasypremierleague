import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { readSession } from '@/lib/auth';
import { isLeagueMember } from '@/lib/leagues';
import ChatRoom from '@/components/leagues/ChatRoom';

export const dynamic = 'force-dynamic';

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readSession();
  if (!session) redirect(`/?next=/league/${id}/chat`);
  if (!(await isLeagueMember(session.userId, id))) notFound();

  return (
    <div className="reveal space-y-4 pb-4 pt-1 lg:mx-auto lg:max-w-2xl">
      <Link href={`/league/${id}`} className="flex items-center gap-1 text-sm font-semibold text-muted">
        <ArrowLeft className="h-4 w-4" /> League
      </Link>
      <h1 className="text-center font-display text-4xl">Chat</h1>
      <ChatRoom leagueId={id} myUsername={session.username} />
    </div>
  );
}
