import clsx from 'clsx';

const COLORS = ['#ea6a12', '#0f9f8f', '#d63a5a', '#c58a0a', '#2f9e4f', '#2b7fb8', '#6f9a12', '#56637a'];

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
        boxShadow: `0 0 0 1px rgb(255 255 255 / 0.12) inset`,
      }}
      aria-hidden
    >
      {Array.from(name)[0]?.toUpperCase()}
    </span>
  );
}
