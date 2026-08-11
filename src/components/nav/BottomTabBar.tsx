'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TABS } from './tabs';

export default function BottomTabBar() {
  const pathname = usePathname();
  if (pathname === '/') return null;

  // Floating pill bar: inset from every edge so it reads as a deliberate
  // layer over the page instead of a strip pinned to a variable viewport
  // bottom (which left a mismatched band on short pages).
  return (
    <nav className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-40 lg:hidden">
      <div className="glass mx-auto flex max-w-md rounded-[1.6rem] px-1.5 py-1.5 shadow-xl shadow-black/20">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-[1.15rem] text-[0.62rem] font-semibold transition-colors ${
                active ? 'text-[var(--accent-ink)]' : 'text-muted hover:text-foreground'
              }`}
            >
              {active ? (
                <span className="absolute inset-0 -z-10 rounded-[1.15rem] bg-accent" aria-hidden />
              ) : null}
              <Icon className="h-5 w-5" strokeWidth={2.3} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
