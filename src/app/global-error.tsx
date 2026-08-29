'use client';

// Last-resort boundary: only fires if the root layout itself fails, which
// error.tsx cannot catch. Kept plain (no shared fonts or nav) since the
// layout that would normally supply them is the thing that broke.
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          display: 'flex',
          minHeight: '100vh',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          background: '#0a0912',
          color: '#f5f3ef',
          textAlign: 'center',
          padding: '1.5rem',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Something went wrong</h1>
        <p style={{ maxWidth: '20rem', fontSize: '0.875rem', opacity: 0.7 }}>
          That was a hiccup loading the app, not the whole site being down. Give it another try.
        </p>
        <button
          onClick={() => reset()}
          style={{
            borderRadius: '999px',
            background: '#f5b73d',
            color: '#0a0912',
            fontWeight: 700,
            padding: '0.75rem 1.5rem',
            border: 'none',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
