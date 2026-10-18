import type { PortfolioBet } from '@watercooler/shared';
import clsx from 'clsx';
import { Link } from 'react-router';
import { formatMoney, formatSigned } from '../lib/format';
import { Empty } from './ui';

const STATE_LABEL: Record<PortfolioBet['state'], { text: string; className: string }> = {
  active: { text: '等待结果', className: 'text-dim' },
  won: { text: '押中', className: 'text-yes' },
  lost: { text: '未押中', className: 'text-no' },
  refunded: { text: '已退款', className: 'text-faint' },
};

export function BetsTable({ bets, empty }: { bets: PortfolioBet[]; empty: string }) {
  if (bets.length === 0) return <Empty title={empty} />;
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-faint">
            <th className="px-5 py-2.5 font-medium">市场</th>
            <th className="px-3 py-2.5 text-right font-medium">下注</th>
            <th className="px-3 py-2.5 text-right font-medium">猜中可得 / 到手</th>
            <th className="px-5 py-2.5 text-right font-medium">盈亏</th>
          </tr>
        </thead>
        <tbody>
          {bets.map((b) => {
            const state = STATE_LABEL[b.state];
            return (
              <tr
                key={`${b.market.id}-${b.outcomeId}`}
                className="border-b border-line transition last:border-0 hover:bg-raised"
              >
                <td className="max-w-[320px] px-5 py-3">
                  <Link to={`/market/${b.market.id}`} className="line-clamp-1 font-medium hover:underline">
                    {b.market.question}
                  </Link>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className="rounded-md bg-fill px-1.5 py-0.5 text-fg">{b.outcomeLabel}</span>
                    <span className={state.className}>{state.text}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-right font-mono tabular">{formatMoney(b.stake)}</td>
                <td className="px-3 py-3 text-right font-mono tabular">
                  {formatMoney(b.payout)}
                  {b.state === 'active' && <div className="text-xs text-faint">按当前奖池</div>}
                </td>
                <td
                  className={clsx(
                    'px-5 py-3 text-right font-mono tabular',
                    b.pnl === null
                      ? 'text-faint'
                      : b.pnl > 0.004
                        ? 'text-yes'
                        : b.pnl < -0.004
                          ? 'text-no'
                          : 'text-dim',
                  )}
                >
                  {b.pnl === null ? '—' : formatSigned(b.pnl)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
