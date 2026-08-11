'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TABS } from './tabs';

// One opaque layer, pinned flush to the real bottom edge. The safe-area
// inset is padded INSIDE the bar so its background paints all the way under
// the home indicator, and every page fills the dynamic viewport (see
// globals.css) so the bar sits identically on every tab.
export default function BottomTabBar() {
  const pathname = usePathname();
  if (pathname === '/') return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-surface lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-md items-stretch px-2 pb-1 pt-1.5">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-1 text-[0.62rem] font-semibold transition-colors ${
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
