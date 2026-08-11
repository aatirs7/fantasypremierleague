'use client';

import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';

// Dark/light toggle, top corner next to the help button. The choice lives
// in a cookie so the server renders the right theme on first paint.
export default function ThemeButton({ initial }: { initial: 'dark' | 'light' }) {
  const [theme, setTheme] = useState(initial);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.cookie = `epld_theme=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  };

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="glass fixed right-16 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-full text-muted shadow-lg shadow-black/20 active:scale-95"
    >
      {theme === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
    </button>
  );
}
