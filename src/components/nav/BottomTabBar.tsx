'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TABS } from './tabs';

// A normal flex child at the bottom of the app shell (no position: fixed,
// so iOS cannot misplace it on cold start). Exact-height tab row plus a
// spacer that paints the home-indicator safe area.
export default function BottomTabBar() {
  const pathname = usePathname();
  if (pathname === '/') return null;

  return (
    <nav className="z-40 shrink-0 border-t border-edge bg-surface lg:hidden">
      <div className="mx-auto grid h-[3.25rem] max-w-md grid-cols-6">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center gap-0.5 text-[0.6rem] font-semibold leading-none ${
                active ? 'text-accent' : 'text-muted-2'
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={2.2} />
              {tab.label}
            </Link>
          );
        })}
      </div>
      <div style={{ height: 'env(safe-area-inset-bottom)' }} aria-hidden />
    </nav>
  );
}
