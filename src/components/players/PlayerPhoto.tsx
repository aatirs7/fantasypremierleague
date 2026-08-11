'use client';

import { useState } from 'react';

// Official Premier League headshot, keyed by the player's photo code from
// bootstrap-static. Falls back to an initial on a tinted disc if the CDN
// has no image (new signings sometimes lag).
export default function PlayerPhoto({
  photoCode,
  name,
  size = 40,
  className = '',
}: {
  photoCode: number | null;
  name: string;
  size?: number;
  className?: string;
}) {
  // Fallback chain: the big headshot, then the smaller legacy size the CDN
  // sometimes has when 250x250 is missing, then an initial disc.
  const [attempt, setAttempt] = useState(0);
  const sources =
    photoCode == null
      ? []
      : [
          `https://resources.premierleague.com/premierleague/photos/players/250x250/p${photoCode}.png`,
          `https://resources.premierleague.com/premierleague/photos/players/110x140/p${photoCode}.png`,
        ];
  const failed = attempt >= sources.length;
  if (photoCode == null || failed) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-accent/10 font-display text-accent ring-1 ring-accent/20 ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.45 }}
        aria-hidden
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sources[attempt]}
      alt={name}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setAttempt(attempt + 1)}
      className={`shrink-0 rounded-full bg-white/[0.04] object-cover object-top ring-1 ring-[var(--line)] ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
