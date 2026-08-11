'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TABS } from './tabs';

// Deliberately dumb bottom bar: one fixed element pinned to bottom: 0,
// an exact-height tab row (no minimums, no vertical padding), and a
// separate spacer whose only job is to cover the home-indicator safe area
// with the same background. Nothing here can stretch or drift per page.
export default function BottomTabBar() {
  const pathname = usePathname();
  if (pathname === '/') return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-surface lg:hidden">
      <div className="mx-auto grid h-[3.25rem] max-w-md grid-cols-5">
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
