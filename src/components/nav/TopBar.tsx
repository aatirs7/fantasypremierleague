'use client';

import { usePathname } from 'next/navigation';

// A real app bar on mobile. Beyond looking intentional, it gives the top of
// the screen a defined edge, so the iOS status bar reads as chrome above the
// app rather than a stray strip floating over the page.
export default function TopBar() {
  const pathname = usePathname();
  if (pathname === '/') return null;

  return (
    <header className="app-bar sticky top-0 z-30 flex h-12 items-center justify-center lg:hidden">
      <span className="text-[0.62rem] font-semibold uppercase tracking-[0.34em] text-muted">
        EPL Draft
      </span>
    </header>
  );
}
