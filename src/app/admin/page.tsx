import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { readSession } from '@/lib/auth';
import { currentAdminId } from '@/lib/admin';
import BackButton from '@/components/BackButton';
import AdminUsers from '@/components/admin/AdminUsers';

export const dynamic = 'force-dynamic';

// Admin-only account recovery. Anyone else is bounced to their profile so
// the page does not exist as far as they can tell.
export default async function AdminPage() {
  const session = await readSession();
  if (!session) redirect('/?next=/admin');
  if (!(await currentAdminId())) redirect('/me');

  return (
    <div className="reveal space-y-6 pb-4 pt-1 lg:mx-auto lg:max-w-2xl">
      <BackButton fallback="/me" label="Profile" />
      <header className="space-y-2 text-center">
        <div className="flex items-center justify-center gap-1.5 text-accent">
          <ShieldCheck className="h-4 w-4" strokeWidth={2.4} />
          <span className="text-[0.7rem] font-bold uppercase tracking-[0.2em]">Admin</span>
        </div>
        <h1 className="font-display text-3xl leading-none">Manage accounts</h1>
        <p className="text-xs text-muted">
          Find a manager who forgot their PIN, give them a reset code, and they set a new PIN under
          &quot;Forgot your PIN?&quot; on the sign-in screen.
        </p>
      </header>
      <AdminUsers />
    </div>
  );
}
