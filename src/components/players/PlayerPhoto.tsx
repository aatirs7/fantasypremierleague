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
  // Fallback chain, in coverage order. The PL moved its headshots to the
  // premierleague25 path with no "p" prefix; that alone covers 564 of the
  // 614 active players, where the legacy 250x250 path now 403s for every
  // recent signing. The old path still holds a handful of veterans, so it
  // stays as the second try, and 37 fringe names have no image anywhere and
  // fall through to the initial disc.
  const [attempt, setAttempt] = useState(0);
  const sources =
    photoCode == null
      ? []
      : [
          `https://resources.premierleague.com/premierleague25/photos/players/110x140/${photoCode}.png`,
          `https://resources.premierleague.com/premierleague/photos/players/250x250/p${photoCode}.png`,
        ];
  const failed = attempt >= sources.length;
  if (photoCode == null || failed) {
    // A blank kit silhouette, the way every football site does it. An
    // initial in a circle reads like an avatar, not a missing photo.
    return (
      <span
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.05] ring-1 ring-[var(--line)] ${className}`}
        style={{ width: size, height: size }}
        aria-label={name}
        role="img"
      >
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="none"
          aria-hidden
          style={{ transform: 'translateY(8%) scale(1.06)' }}
        >
          <circle cx="12" cy="8.4" r="4.1" fill="currentColor" className="text-muted-2" />
          <path
            d="M3.6 22c0-4.3 3.8-7.2 8.4-7.2s8.4 2.9 8.4 7.2z"
            fill="currentColor"
            className="text-muted-2"
          />
        </svg>
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
