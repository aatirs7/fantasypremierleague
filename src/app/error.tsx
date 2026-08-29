'use client';

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

// Route-level error boundary. Without this, any hiccup while a page is
// loading its data (a slow DB response, a dropped connection) fell straight
// through to the browser's own bare "server error" screen. This keeps it
// inside the app's own look, with a way back in that does not need a full
// reload.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="reveal flex min-h-[70vh] flex-col items-center justify-center space-y-4 pb-4 pt-1 text-center lg:mx-auto lg:max-w-2xl">
      <span
        className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(245,183,61,0.18), transparent 70%)' }}
      >
        <RefreshCw className="h-8 w-8 text-gold" strokeWidth={1.6} />
      </span>
      <div className="space-y-1">
        <h1 className="font-display text-2xl">Something went wrong</h1>
        <p className="max-w-xs text-sm text-muted">
          That was a hiccup loading the page, not the whole site being down. Give it another try.
        </p>
      </div>
      <button onClick={() => reset()} className="btn-primary w-full max-w-xs">
        Try again
      </button>
    </div>
  );
}
