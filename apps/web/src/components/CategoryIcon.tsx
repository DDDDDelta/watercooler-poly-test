import clsx from 'clsx';
import { Building2, CandlestickChart, Coffee, Cpu, Popcorn, Shapes, Trophy, type LucideIcon } from 'lucide-react';

const ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  公司: { icon: Building2, color: '#ff7a1a' },
  行情: { icon: CandlestickChart, color: '#f43f5e' },
  科技: { icon: Cpu, color: '#38bdf8' },
  体育: { icon: Trophy, color: '#facc15' },
  生活: { icon: Coffee, color: '#34d399' },
  娱乐: { icon: Popcorn, color: '#f472b6' },
};
const FALLBACK = { icon: Shapes, color: '#94a3b8' };

export function CategoryIcon({
  category,
  size = 44,
  className,
}: {
  category: string;
  size?: number;
  className?: string;
}) {
  const { icon: Icon, color } = ICONS[category] ?? FALLBACK;
  return (
    <span
      className={clsx(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl',
        className,
      )}
      style={{ width: size, height: size, background: `${color}1a` }}
    >
      <span className="absolute inset-0 rounded-xl" style={{ boxShadow: `inset 0 0 0 1px ${color}40` }} />
      <Icon style={{ width: size * 0.48, height: size * 0.48, color }} strokeWidth={1.8} />
    </span>
  );
}
