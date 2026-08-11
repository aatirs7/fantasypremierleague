import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { editableGw } from '@/lib/lineup';
import Welcome from '@/components/auth/Welcome';

export const dynamic = 'force-dynamic';

export default async function Landing({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await readSession();
  const { next } = await searchParams;
  if (session) redirect(next || '/home');

  let kickoffLine: string | undefined;
  try {
    const kickoff = await editableGw();
    if (kickoff) {
      kickoffLine = `Gameweek ${kickoff.gw} kicks off ${kickoff.deadline.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })}`;
    }
  } catch {
    kickoffLine = undefined;
  }

  return <Welcome next={next} kickoffLine={kickoffLine} />;
}
