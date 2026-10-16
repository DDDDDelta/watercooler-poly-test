import type { MarketSummary } from '@watercooler/shared';
import clsx from 'clsx';
import { Ban, CheckCircle2, Hourglass } from 'lucide-react';

export function StatusBadge({ market, className }: { market: MarketSummary; className?: string }) {
  if (market.status === 'open') {
    return (
      <span className={clsx('inline-flex items-center gap-1.5 text-xs font-medium text-yes', className)}>
        <span className="size-1.5 animate-pulse-ring rounded-full bg-yes" />
        交易中
      </span>
    );
  }
  if (market.status === 'closed') {
    return (
      <span className={clsx('inline-flex items-center gap-1 text-xs font-medium text-gold', className)}>
        <Hourglass className="size-3.5" /> 待结算
      </span>
    );
  }
  if (market.status === 'cancelled') {
    return (
      <span className={clsx('inline-flex items-center gap-1 text-xs font-medium text-faint', className)}>
        <Ban className="size-3.5" /> 已取消
      </span>
    );
  }
  const winner = market.outcomes.find((o) => o.id === market.resolvedOutcomeId);
  return (
    <span className={clsx('inline-flex items-center gap-1 text-xs font-medium text-brand-2', className)}>
      <CheckCircle2 className="size-3.5" /> 已结算{winner ? ` · ${winner.label}` : ''}
    </span>
  );
}
