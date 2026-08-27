'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

// Go back to wherever you actually came from. A hardcoded href sends you to
// a list you were never on: tap a player from My Team and you would land on
// the Players tab, having lost your place.
export default function BackButton({
  fallback,
  label,
  className,
}: {
  fallback: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const go = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push(fallback);
  };
  return (
    <button
      onClick={go}
      aria-label={label ?? 'Back'}
      className={className ?? 'flex items-center gap-1 text-sm font-semibold text-muted'}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
