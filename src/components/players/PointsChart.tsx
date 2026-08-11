// Pure SVG line chart of points per gameweek, violet per the reference
// design. Server-safe: no state, no effects.
export default function PointsChart({
  points,
}: {
  points: { gw: number; value: number }[];
}) {
  if (points.length < 2) return null;
  const W = 320;
  const H = 150;
  const PAD_X = 26;
  const PAD_Y = 14;
  const maxY = Math.max(5, ...points.map((p) => p.value));
  const minGw = points[0].gw;
  const maxGw = points[points.length - 1].gw;
  const x = (gw: number) =>
    PAD_X + ((gw - minGw) / Math.max(1, maxGw - minGw)) * (W - PAD_X * 2);
  const y = (v: number) => H - PAD_Y - (v / maxY) * (H - PAD_Y * 2);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.gw)},${y(p.value)}`).join(' ');
  const gridYs = [0, Math.round(maxY / 2), maxY];
  const labelGws = points
    .filter((_, i) => i % Math.max(1, Math.floor(points.length / 5)) === 0)
    .map((p) => p.gw);

  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full" role="img" aria-label="Points by gameweek">
      {gridYs.map((v) => (
        <g key={v}>
          <line
            x1={PAD_X}
            x2={W - PAD_X}
            y1={y(v)}
            y2={y(v)}
            stroke="currentColor"
            className="text-[var(--line)]"
            strokeWidth="1"
          />
          <text
            x={PAD_X - 6}
            y={y(v) + 3}
            textAnchor="end"
            fontSize="8"
            fill="var(--muted-2)"
          >
            {v}
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p) => (
        <circle
          key={p.gw}
          cx={x(p.gw)}
          cy={y(p.value)}
          r="2.6"
          fill="var(--bg)"
          stroke="var(--accent)"
          strokeWidth="1.6"
        />
      ))}
      {labelGws.map((gw) => (
        <text key={gw} x={x(gw)} y={H + 10} textAnchor="middle" fontSize="8" fill="var(--muted-2)">
          GW {gw}
        </text>
      ))}
    </svg>
  );
}
