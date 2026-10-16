import { NO_COLOR, YES_COLOR } from '../lib/colors';
import { formatPct } from '../lib/format';

/** Circular gauge; green above 50%, red below. */
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
  const color = value >= 0.5 ? YES_COLOR : NO_COLOR;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * Math.max(0.005, value)} ${c}`}
          style={{ transition: 'stroke-dasharray .6s ease' }}
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
