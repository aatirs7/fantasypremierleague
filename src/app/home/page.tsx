import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await readSession();
  if (!session) redirect('/?next=/home');

  return (
    <div className="reveal space-y-4 py-4 lg:mx-auto lg:max-w-2xl">
      <h1 className="font-display text-4xl">Home</h1>
      <div className="card p-4 text-sm text-muted">
        Welcome, {session.username}. Leagues are coming in the next deploy.
      </div>
    </div>
  );
}
