// Circular countdown ring, violet on a dark track, time in the middle.
// Driven entirely by props; the parent ticks.
export default function RingTimer({
  remainMs,
  totalMs,
  size = 84,
}: {
  remainMs: number;
  totalMs: number;
  size?: number;
}) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, remainMs / Math.max(1, totalMs)));
  const secs = Math.max(0, Math.ceil(remainMs / 1000));
  const mm = Math.floor(secs / 60);
  const ss = secs % 60;
  const danger = frac < 0.22;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth="5"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={danger ? 'var(--live)' : 'var(--accent)'}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 0.2s linear' }}
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center font-bold tabular-nums ${
          danger ? 'text-live' : ''
        }`}
        style={{ fontSize: size * 0.21 }}
      >
        {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
      </span>
    </div>
  );
}
