import type { PortfolioPosition } from '@watercooler/shared';
import clsx from 'clsx';
import { Link } from 'react-router';
import { formatMoney, formatPct1, formatShares, formatSigned } from '../lib/format';
import { Empty } from './ui';

const STATE_LABEL: Record<PortfolioPosition['state'], { text: string; className: string }> = {
  active: { text: '持有中', className: 'text-dim' },
  won: { text: '猜中', className: 'text-yes' },
  lost: { text: '未中', className: 'text-no' },
  refunded: { text: '已退款', className: 'text-faint' },
};

export function PositionsTable({ positions, empty }: { positions: PortfolioPosition[]; empty: string }) {
  if (positions.length === 0) return <Empty title={empty} />;
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-faint">
            <th className="px-5 py-2.5 font-medium">市场</th>
            <th className="px-3 py-2.5 text-right font-medium">份额</th>
            <th className="px-3 py-2.5 text-right font-medium">均价 → 现价</th>
            <th className="px-3 py-2.5 text-right font-medium">价值</th>
            <th className="px-5 py-2.5 text-right font-medium">盈亏</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const pct = p.cost > 0 ? p.pnl / p.cost : 0;
            const state = STATE_LABEL[p.state];
            return (
              <tr
                key={`${p.market.id}-${p.outcomeId}`}
                className="border-b border-line transition last:border-0 hover:bg-raised"
              >
                <td className="max-w-[320px] px-5 py-3">
                  <Link to={`/market/${p.market.id}`} className="line-clamp-1 font-medium hover:underline">
                    {p.market.question}
                  </Link>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className="rounded-md bg-fill px-1.5 py-0.5 text-fg">{p.outcomeLabel}</span>
                    <span className={state.className}>{state.text}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-right font-mono tabular">{formatShares(p.shares)}</td>
                <td className="px-3 py-3 text-right font-mono text-xs tabular text-dim">
                  {formatPct1(p.avgPrice)} → <span className="text-fg">{formatPct1(p.price)}</span>
                </td>
                <td className="px-3 py-3 text-right font-mono tabular">{formatMoney(p.value)}</td>
                <td
                  className={clsx(
                    'px-5 py-3 text-right font-mono tabular',
                    p.pnl > 0.004 ? 'text-yes' : p.pnl < -0.004 ? 'text-no' : 'text-dim',
                  )}
                >
                  {formatSigned(p.pnl)}
                  <div className="text-xs opacity-70">{formatSigned(pct * 100, 1)}%</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
