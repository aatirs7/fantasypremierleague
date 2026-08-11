'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TABS } from './tabs';

// Slim translucent bar, icons over tiny labels, active = violet. No pill.
export default function BottomTabBar() {
  const pathname = usePathname();
  if (pathname === '/') return null;

  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-40 border-t border-edge pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="mx-auto flex max-w-md px-2 pb-1 pt-2">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-1 text-[0.62rem] font-semibold transition-colors ${
                active ? 'text-accent' : 'text-muted-2 hover:text-muted'
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
