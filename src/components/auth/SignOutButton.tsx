'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

export default function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/');
        router.refresh();
      }}
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-edge bg-white/[0.03] px-4 text-sm font-bold text-muted active:scale-95"
    >
      <LogOut className="h-4 w-4" />
      Sign out
    </button>
  );
}
