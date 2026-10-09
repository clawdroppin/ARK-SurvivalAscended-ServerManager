import { useId, useMemo } from 'react';

/**
 * Lightweight SVG area chart. Pure render from props; no layout thrash, safe at 1–2 Hz updates.
 */
export function AreaChart({
  data,
  max,
  color = '#2dd4bf',
  height = 56,
  min = 0,
}: {
  data: number[];
  max?: number;
  color?: string;
  height?: number;
  min?: number;
}) {
  const id = useId().replace(/:/g, '');
  const W = 300;
  const H = height;
  const path = useMemo(() => {
    if (data.length < 2) return null;
    const hi = Math.max(max ?? 0, ...data, min + 1e-9);
    const step = W / (data.length - 1);
    const pts = data.map((v, i) => [i * step, H - 2 - ((v - min) / (hi - min)) * (H - 6)] as const);
    // Smooth with a light Catmull-Rom → Bézier conversion.
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
    }
    return { line: d, area: `${d} L${W},${H} L0,${H} Z` };
  }, [data, max, min, H]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full" style={{ height }}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="white" strokeOpacity="0.04" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
      {path ? (
        <>
          <path d={path.area} fill={`url(#g${id})`} />
          <path d={path.line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </>
      ) : (
        <line x1="0" x2={W} y1={H - 2} y2={H - 2} stroke={color} strokeOpacity="0.25" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}
