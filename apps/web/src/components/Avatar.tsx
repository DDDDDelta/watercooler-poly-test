import clsx from 'clsx';

const COLORS = ['#1c55fb', '#14c9c9', '#ff7d00', '#f5319d', '#00b42a', '#3491fa', '#f7ba1e', '#86909c'];

/** Deterministic coloured avatar with the user's first character. */
export function Avatar({
  id,
  name,
  size = 32,
  className,
}: {
  id: number;
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: COLORS[id % COLORS.length],
      }}
      aria-hidden
    >
      {Array.from(name)[0]?.toUpperCase()}
    </span>
  );
}
