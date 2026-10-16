import { useId } from 'react';
import { NO_COLOR, YES_COLOR } from '../lib/colors';

/** Tiny area chart of a probability series (0..1), coloured by trend. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const id = useId();
  if (values.length < 2) return null;
  const w = 100;
  const h = 32;
  const lo = Math.max(0, Math.min(...values) - 0.05);
  const hi = Math.min(1, Math.max(...values) + 0.05);
  const range = Math.max(hi - lo, 0.1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - ((v - lo) / range) * (h - 4) - 2] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('');
  const color = values[values.length - 1]! >= values[0]! ? YES_COLOR : NO_COLOR;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L${w},${h}L0,${h}Z`} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 3px ${color}aa)` }}
      />
    </svg>
  );
}
