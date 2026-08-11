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

// The big-number variant from the reference design: 02 DAYS 14 HRS 37 MINS.
export function CountdownBlocks({ toIso, doneText }: { toIso: string; doneText: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const ms = new Date(toIso).getTime() - now;
  if (ms <= 0) {
    return <p className="text-lg font-bold text-accent">{doneText}</p>;
  }
  const s = Math.floor(ms / 1000);
  const blocks =
    s >= 86400
      ? [
          [Math.floor(s / 86400), 'Days'],
          [Math.floor((s % 86400) / 3600), 'Hrs'],
          [Math.floor((s % 3600) / 60), 'Mins'],
        ]
      : [
          [Math.floor(s / 3600), 'Hrs'],
          [Math.floor((s % 3600) / 60), 'Mins'],
          [s % 60, 'Secs'],
        ];

  return (
    <div className="flex justify-center gap-8">
      {blocks.map(([n, label]) => (
        <div key={label as string} className="text-center">
          <p className="text-2xl font-bold tabular-nums leading-tight">
            {String(n).padStart(2, '0')}
          </p>
          <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-muted-2">
            {label}
          </p>
        </div>
      ))}
    </div>
  );
}
