'use client';

import { useState, type ReactNode } from 'react';

// Underline tabs from the reference design. Panels are server-rendered and
// passed in; this only switches visibility.
export default function PlayerTabs({
  tabs,
}: {
  tabs: { label: string; content: ReactNode }[];
}) {
  const [active, setActive] = useState(0);
  return (
    <div>
      <div className="flex gap-6 border-b border-edge px-1">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setActive(i)}
            data-active={i === active}
            className="tab-underline"
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-4">{tabs[active]?.content}</div>
    </div>
  );
}
