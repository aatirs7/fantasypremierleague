'use client';

import { useEffect, useState } from 'react';

// Renders time remaining to a server-provided timestamp. Server timestamp is
// the truth; this just formats the difference and ticks.
export default function Countdown({ toIso, doneText }: { toIso: string; doneText: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const ms = new Date(toIso).getTime() - now;
  if (ms <= 0) return <span className="text-accent">{doneText}</span>;

  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const text =
    d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`;
  return <span className="tabular-nums">{text}</span>;
}
