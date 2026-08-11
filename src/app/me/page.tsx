import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import SignOutButton from '@/components/auth/SignOutButton';

export const dynamic = 'force-dynamic';

export default async function MePage() {
  const session = await readSession();
  if (!session) redirect('/?next=/me');

  return (
    <div className="reveal space-y-4 py-4 lg:mx-auto lg:max-w-2xl">
      <h1 className="font-display text-4xl">Me</h1>
      <div className="card p-4">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Signed in as</p>
        <p className="mt-1 text-xl font-bold">{session.username}</p>
        <p className="mt-2 text-xs text-muted">Remember your PIN, there is no reset.</p>
      </div>
      <SignOutButton />
    </div>
  );
}
