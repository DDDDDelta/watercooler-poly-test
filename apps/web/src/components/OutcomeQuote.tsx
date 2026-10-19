import type { Outcome } from '@watercooler/shared';

export function OutcomeQuote({ outcome }: { outcome: Outcome }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-2 text-left">
      <span className="truncate font-semibold">{outcome.label}</span>
      {outcome.bestBid == null && outcome.bestAsk == null ? (
        <span className="text-xs font-normal text-faint">暂无挂单</span>
      ) : (
        <span className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs font-normal text-dim">
          <span>
            买一 <span className="font-mono text-yes">{outcome.bestBid?.toFixed(2) ?? '—'}</span>
          </span>
          <span>
            卖一 <span className="font-mono text-no">{outcome.bestAsk?.toFixed(2) ?? '—'}</span>
          </span>
        </span>
      )}
    </span>
  );
}
