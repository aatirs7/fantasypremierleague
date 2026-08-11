'use client';

import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';

// Keep this in sync with THEME_COLORS in app/layout.tsx.
const THEME_COLORS = { dark: '#0a0912', light: '#f2f3f8' } as const;

function useThemeToggle(initial: 'dark' | 'light') {
  const [theme, setTheme] = useState(initial);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.cookie = `epld_theme=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    // Repaint the iOS status bar area immediately, without a reload.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLORS[next]);
  };
  return { theme, toggle };
}

// Flat corner toggle, next to the help button.
export default function ThemeButton({ initial }: { initial: 'dark' | 'light' }) {
  const { theme, toggle } = useThemeToggle(initial);
  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="fixed right-12 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 flex h-10 w-10 items-center justify-center text-muted active:scale-95"
    >
      {theme === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
    </button>
  );
}

// Menu-row variant for the More page.
export function ThemeRow({ initial }: { initial: 'dark' | 'light' }) {
  const { theme, toggle } = useThemeToggle(initial);
  return (
    <button onClick={toggle} className="flex min-h-14 w-full items-center gap-3 px-2.5 text-left">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
        {theme === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">Appearance</span>
        <span className="block text-xs text-muted">
          {theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        </span>
      </span>
    </button>
  );
}
