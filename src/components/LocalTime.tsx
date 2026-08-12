'use client';

import { useEffect, useState } from 'react';

// Renders a timestamp in the viewer's own timezone and locale. Server
// rendering happens in UTC, so the first paint is a placeholder formatting
// and the effect swaps in the device-local text right after mount.
type Mode = 'time' | 'weekday-time' | 'date-time' | 'day';

const OPTIONS: Record<Mode, Intl.DateTimeFormatOptions> = {
  time: { hour: 'numeric', minute: '2-digit' },
  'weekday-time': { weekday: 'short', hour: 'numeric', minute: '2-digit' },
  'date-time': {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  },
  day: { weekday: 'long', month: 'short', day: 'numeric' },
};

export default function LocalTime({ iso, mode = 'time' }: { iso: string; mode?: Mode }) {
  const format = (locale?: string, timeZone?: string) =>
    new Date(iso).toLocaleString(locale ?? 'en-US', { ...OPTIONS[mode], timeZone });

  const [text, setText] = useState(() => format('en-US', 'UTC'));

  useEffect(() => {
    setText(new Date(iso).toLocaleString(undefined, OPTIONS[mode]));
  }, [iso, mode]);

  return <span suppressHydrationWarning>{text}</span>;
}
