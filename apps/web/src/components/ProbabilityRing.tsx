import { useId } from 'react';
import { formatPct } from '../lib/format';

/** Circular gauge with a glowing gradient arc. */
export function ProbabilityRing({
  value,
  size = 64,
  stroke = 5,
  label = '概率',
  colors,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  colors?: [string, string];
}) {
  const id = useId();
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  const [from, to] = colors ?? (value >= 0.5 ? ['#19e3a1', '#22d3ee'] : ['#ff4f7b', '#f59e0b']);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * Math.max(0.005, value)} ${c}`}
          style={{ filter: `drop-shadow(0 0 4px ${from}99)`, transition: 'stroke-dasharray .6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-display font-semibold tabular" style={{ fontSize: size * 0.24 }}>
          {formatPct(value)}
        </span>
        {label && (
          <span className="mt-0.5 text-faint" style={{ fontSize: Math.max(9, size * 0.14) }}>
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
