import clsx from 'clsx';
import { useId } from 'react';
import { CURRENCY_NAME } from '@watercooler/shared';
import { formatCompact, formatMoney } from '../lib/format';

/** The currency glyph: a little gradient water drop. */
export function Drop({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 16 16" className={clsx('inline-block size-[0.95em] shrink-0', className)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#67e8f9" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <path d="M8 1.2c2.6 3.1 4.8 5.8 4.8 8.3a4.8 4.8 0 0 1-9.6 0c0-2.5 2.2-5.2 4.8-8.3Z" fill={`url(#${id})`} />
      <path
        d="M6 10.2a2.1 2.1 0 0 0 2 2"
        stroke="#fff"
        strokeOpacity=".85"
        strokeWidth="1.1"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function Money({
  value,
  compact,
  className,
  signed,
}: {
  value: number;
  compact?: boolean;
  className?: string;
  signed?: boolean;
}) {
  const shown = signed ? Math.abs(value) : value;
  const text = compact ? formatCompact(shown) : formatMoney(shown);
  const sign = signed ? (value > 0.004 ? '+' : value < -0.004 ? '-' : '') : '';
  return (
    <span
      className={clsx('inline-flex items-center gap-1 tabular', className)}
      title={`${formatMoney(value)} ${CURRENCY_NAME}`}
    >
      {sign}
      <Drop />
      {text}
    </span>
  );
}
