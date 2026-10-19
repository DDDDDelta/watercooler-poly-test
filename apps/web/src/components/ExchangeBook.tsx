import type { BookLevel, ExchangeState, MarketDetail, OrderInput } from '@watercooler/shared';
import { errorMessage } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';
import { Card, Segmented, Spinner } from './ui';

export function ExchangeBook({
  market,
  data,
  error,
  outcomeId,
  onOutcomeChange,
  onQuoteSelect,
}: {
  market: MarketDetail;
  data: ExchangeState | undefined;
  error: Error | null;
  outcomeId: number;
  onOutcomeChange: (id: number) => void;
  onQuoteSelect: (side: OrderInput['side'], price: string) => void;
}) {
  if (error)
    return (
      <Card className="p-5">
        <p className="text-no">{errorMessage(error)}</p>
      </Card>
    );
  if (!data)
    return (
      <Card className="p-5">
        <Spinner />
      </Card>
    );
  const book = data.books.find((b) => b.outcomeId === outcomeId)!;
  const open = market.status === 'open';
  const levelColumn = (title: string, rows: BookLevel[], isAsk: boolean) => (
    <div>
      <h3 className={isAsk ? 'mb-2 text-sm text-no' : 'mb-2 text-sm text-yes'}>{title}</h3>
      <div className="mb-1 flex justify-between text-xs text-faint">
        <span>价格</span>
        <span>份数</span>
      </div>
      {rows.slice(0, 8).map((r) => (
        <button
          key={r.price}
          type="button"
          disabled={!open}
          onClick={() => onQuoteSelect(isAsk ? 'buy' : 'sell', r.price.toFixed(2))}
          className="flex w-full justify-between rounded px-1 py-1 font-mono text-sm hover:bg-fill"
        >
          <span className={isAsk ? 'text-no' : 'text-yes'}>{r.price.toFixed(2)}</span>
          <span>{r.quantity}</span>
        </button>
      ))}
      {rows.length === 0 && <p className="py-3 text-xs text-faint">暂无挂单</p>}
    </div>
  );
  return (
    <>
      <Card className="space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Polymarket · 份额交易</h2>
          <p className="mt-1 text-xs text-faint">抵押资金 {formatMoney(data.collateral)} 水滴 · 获胜每份兑回 1</p>
        </div>
        <Segmented
          value={String(outcomeId)}
          onChange={(id) => onOutcomeChange(Number(id))}
          options={market.outcomes.map((o) => ({ value: String(o.id), label: o.label }))}
        />
        <div className="grid grid-cols-2 gap-5 rounded bg-raised p-3">
          {levelColumn('Bid · 买单', book.bids, false)}
          {levelColumn('Ask · 卖单', book.asks, true)}
        </div>
        <p className="text-xs text-faint">
          最新成交：{book.lastPrice === null ? '暂无' : book.lastPrice.toFixed(2)}
          。盘口只显示当前选项的实际挂单，点击价格可填单；与自己挂单交叉的新单会被拒绝，请先撤旧单或调整价格。
        </p>
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 font-semibold">最近成交</h2>
        <ul className="max-h-64 divide-y divide-line overflow-y-auto">
          {data.trades.map((t) => (
            <li key={t.id} className="py-2 text-xs">
              <div className="flex justify-between">
                <span>
                  {market.outcomes.find((o) => o.id === t.outcomeId)?.label} · {t.quantity} 份 @ {t.price.toFixed(2)}
                </span>
                <span className="text-faint">
                  {t.kind === 'mint' ? '互补铸造' : t.kind === 'merge' ? '互补合并' : '份额转手'}
                </span>
              </div>
              <div className="mt-1 text-faint">{formatDate(t.createdAt)}</div>
            </li>
          ))}
        </ul>
        {!data.trades.length && <p className="text-xs text-faint">暂无成交。先挂买单，或抵押生成一对份额后挂卖单。</p>}
      </Card>
    </>
  );
}
