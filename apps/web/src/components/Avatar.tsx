import clsx from 'clsx';

const GRADIENTS = [
  ['#22d3ee', '#8b5cf6'],
  ['#f472b6', '#8b5cf6'],
  ['#34d399', '#22d3ee'],
  ['#fbbf24', '#f472b6'],
  ['#60a5fa', '#a78bfa'],
  ['#fb923c', '#ec4899'],
  ['#a3e635', '#14b8a6'],
  ['#e879f9', '#6366f1'],
];

/** Deterministic gradient avatar with the user's first character. */
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
  const [a, b] = GRADIENTS[id % GRADIENTS.length]!;
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
        background: `linear-gradient(135deg, ${a}, ${b})`,
        boxShadow: `0 0 0 1px rgb(255 255 255 / 0.12) inset`,
      }}
      aria-hidden
    >
      {Array.from(name)[0]?.toUpperCase()}
    </span>
  );
}
