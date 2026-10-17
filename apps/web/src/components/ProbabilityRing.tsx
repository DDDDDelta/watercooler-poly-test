import { formatPct } from '../lib/format';

/** Circular gauge in the brand blue. */
export function ProbabilityRing({
  value,
  size = 64,
  stroke = 5,
  label = '概率',
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
}) {
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          style={{ stroke: 'var(--color-fill-2)' }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * Math.max(0.005, value)} ${c}`}
          style={{ stroke: 'var(--color-brand)', transition: 'stroke-dasharray .6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-mono font-semibold text-fg" style={{ fontSize: size * 0.24 }}>
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
