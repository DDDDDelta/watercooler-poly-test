import clsx from 'clsx';
import { Building2, CandlestickChart, Coffee, Cpu, Popcorn, Shapes, Trophy, type LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  公司: Building2,
  行情: CandlestickChart,
  科技: Cpu,
  体育: Trophy,
  生活: Coffee,
  娱乐: Popcorn,
};

/** Blue-on-light-blue icon tile, the way ft.tech renders all of its product icons. */
export function CategoryIcon({
  category,
  size = 44,
  className,
}: {
  category: string;
  size?: number;
  className?: string;
}) {
  const Icon = ICONS[category] ?? Shapes;
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-md bg-brand-light text-brand',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Icon style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={1.8} />
    </span>
  );
}
