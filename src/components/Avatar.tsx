// Manager avatar: a kit crest, tinted per manager so the table is scannable
// by shape and colour rather than by reading eight names. The hue is derived
// from the username, so it is stable for the whole season and needs nothing
// stored. Server-safe, no client JS.

// Muted, desaturated hues that sit on ink navy without shouting. Deliberately
// not the accent gold, which means "yours" and "honours" everywhere else.
const HUES = [
  { from: '#3c6e8f', to: '#27506b' }, // slate blue
  { from: '#7b5ea7', to: '#54407a' }, // plum
  { from: '#3f8368', to: '#2a5c48' }, // pine
  { from: '#a35d4a', to: '#7a4234' }, // terracotta
  { from: '#4d6fa8', to: '#354f7d' }, // indigo
  { from: '#8a6a3c', to: '#63492a' }, // bronze
  { from: '#417d8a', to: '#2c5a65' }, // teal
  { from: '#96566f', to: '#6d3c50' }, // mulberry
];

function hueFor(name: string): (typeof HUES)[number] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

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
  const { from, to } = hueFor(name);
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full ${
        ring ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg)]' : ''
      } ${className}`}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(150deg, ${from}, ${to})`,
      }}
      aria-label={name}
      role="img"
    >
      {/* A shirt, not a letter. Reads as a manager at any size. */}
      <svg
        viewBox="0 0 24 24"
        width={size * 0.58}
        height={size * 0.58}
        fill="none"
        stroke="rgba(255,255,255,0.92)"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M8.5 3 5 4.8 3.2 8.6l2.6 1.4V21h12.4V10l2.6-1.4L19 4.8 15.5 3" />
        <path d="M8.5 3a3.5 3.5 0 0 0 7 0" />
      </svg>
    </span>
  );
}
