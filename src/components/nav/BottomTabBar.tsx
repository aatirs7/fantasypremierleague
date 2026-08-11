'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TABS } from './tabs';

// Fixed to the bottom edge, exactly like wc26-general's bar: the web view
// is already inset by iOS (no viewport-fit: cover), so bottom-0 IS the
// bottom of the safe area. The env() padding is a no-op there and only
// matters on browsers that do report an inset.
export default function BottomTabBar() {
  const pathname = usePathname();
  if (pathname === '/') return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-6 px-1 py-2">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center gap-1 text-[0.6rem] font-semibold leading-none ${
                active ? 'text-accent' : 'text-muted-2'
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={2.2} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
