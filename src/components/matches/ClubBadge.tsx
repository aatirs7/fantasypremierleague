'use client';

import { useState } from 'react';

// Official Premier League club badge from the PL CDN, keyed by the club's
// stable code from bootstrap-static. Falls back to a tinted disc with the
// short name if the CDN misses.
export default function ClubBadge({
  clubCode,
  name,
  size = 28,
  className = '',
}: {
  clubCode: number | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (clubCode == null || failed) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[0.55rem] font-bold text-muted ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        {name.slice(0, 3).toUpperCase()}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://resources.premierleague.com/premierleague/badges/50/t${clubCode}.png`}
      alt={name}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
