'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TABS } from './tabs';

export default function BottomTabBar() {
  const pathname = usePathname();
  if (pathname === '/') return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="mx-auto flex max-w-md px-2 py-3">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex min-h-17 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[0.7rem] font-semibold transition-colors ${
                active ? 'text-[var(--accent-ink)]' : 'text-muted hover:text-foreground'
              }`}
            >
              {active ? (
                <span className="absolute inset-0 -z-10 rounded-xl bg-accent" aria-hidden />
              ) : null}
              <Icon className="h-6 w-6" strokeWidth={2.4} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
