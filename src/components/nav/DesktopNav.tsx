'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Trophy } from 'lucide-react';
import { TABS } from './tabs';

// Desktop-only top navigation. The mobile bottom tab bar is hidden at lg
// and this takes over.
export default function DesktopNav() {
  const pathname = usePathname();
  if (pathname === '/') return null;

  return (
    <nav className="fixed inset-x-0 top-0 z-40 hidden border-b border-edge bg-surface/95 backdrop-blur lg:block">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 pl-8 pr-32">
        <Link href="/home" className="flex shrink-0 items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 ring-1 ring-accent/30">
            <Trophy className="h-5 w-5 text-accent" strokeWidth={2.2} />
          </span>
          <span className="font-display text-xl tracking-wide">EPL Fantasy Draft</span>
        </Link>
        <div className="ml-auto flex items-center gap-1">
          {TABS.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`relative flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  active ? 'text-foreground' : 'text-muted-2 hover:text-muted'
                }`}
              >
                {active ? (
                  <span
                    className="absolute inset-0 -z-10 rounded-lg border border-edge bg-[var(--surface-raised)]"
                    aria-hidden
                  />
                ) : null}
                <Icon className="h-4 w-4" strokeWidth={2.4} />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
