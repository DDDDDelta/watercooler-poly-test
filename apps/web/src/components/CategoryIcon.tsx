import clsx from 'clsx';
import { Building2, CandlestickChart, Coffee, Cpu, Popcorn, Shapes, Trophy, type LucideIcon } from 'lucide-react';

const ICONS: Record<string, { icon: LucideIcon; from: string; to: string }> = {
  公司: { icon: Building2, from: '#8b5cf6', to: '#22d3ee' },
  行情: { icon: CandlestickChart, from: '#f43f5e', to: '#fbbf24' },
  科技: { icon: Cpu, from: '#22d3ee', to: '#3b82f6' },
  体育: { icon: Trophy, from: '#f59e0b', to: '#ef4444' },
  生活: { icon: Coffee, from: '#34d399', to: '#14b8a6' },
  娱乐: { icon: Popcorn, from: '#ec4899', to: '#a855f7' },
};
const FALLBACK = { icon: Shapes, from: '#64748b', to: '#8b5cf6' };

export function CategoryIcon({
  category,
  size = 44,
  className,
}: {
  category: string;
  size?: number;
  className?: string;
}) {
  const { icon: Icon, from, to } = ICONS[category] ?? FALLBACK;
  return (
    <span
      className={clsx(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl',
        className,
      )}
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${from}33, ${to}22)` }}
    >
      <span
        className="absolute inset-0 rounded-xl"
        style={{ boxShadow: `inset 0 0 0 1px ${from}55, inset 0 0 18px ${from}33` }}
      />
      <Icon style={{ width: size * 0.48, height: size * 0.48, color: from }} strokeWidth={1.8} />
    </span>
  );
}
