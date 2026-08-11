// Manager avatar: initial on a violet gradient disc. Server-safe.
export default function Avatar({
  name,
  size = 36,
  ring = false,
  className = '',
}: {
  name: string;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${
        ring ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg)]' : ''
      } ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: 'linear-gradient(135deg, #8b5cf6, #4c1d95)',
      }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
