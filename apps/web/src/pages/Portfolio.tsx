import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { LedgerKind } from '@watercooler/shared';
import clsx from 'clsx';
import { useState } from 'react';
import { Link } from 'react-router';
import { Money } from '../components/Money';
import { BetsTable } from '../components/BetsTable';
import { Button, Card, PageLoader, Segmented, Stat } from '../components/ui';
import { api } from '../lib/api';
import { formatDate, formatSigned } from '../lib/format';

const LEDGER_LABEL: Record<LedgerKind, string> = {
  signup: '注册奖励',
  bonus: '每日签到',
  bet: '下注',
  payout: '押中奖金',
  refund: '退款',
  split: '抵押生成 Yes + No',
  merge: '合并赎回',
  order_lock: '买单冻结资金',
  order_release: '订单解冻 / 价差退回',
  sell: '卖出份额',
};

function Ledger() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['ledger'],
    queryFn: ({ pageParam }) => api.ledger(pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => (last.length === 50 ? last[last.length - 1]!.id : undefined),
  });
  const rows = data?.pages.flat() ?? [];
  return (
    <div>
      <ul className="divide-y divide-line">
        {rows.map((l) => (
          <li key={l.id} className="flex items-center gap-4 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{LEDGER_LABEL[l.kind]}</div>
              <div className="truncate text-xs text-faint">
                {l.marketId ? (
                  <Link to={`/market/${l.marketId}`} className="hover:text-dim">
                    {l.marketQuestion}
                  </Link>
                ) : (
                  l.note
                )}
              </div>
            </div>
            <div className="text-right">
              <div className={clsx('font-mono tabular', l.amount >= 0 ? 'text-yes' : 'text-no')}>
                {formatSigned(l.amount)}
              </div>
              <div className="text-xs text-faint">{formatDate(l.createdAt)}</div>
            </div>
          </li>
        ))}
      </ul>
      {hasNextPage && (
        <div className="mt-4 text-center">
          <Button variant="outline" size="sm" loading={isFetchingNextPage} onClick={() => fetchNextPage()}>
            加载更多
          </Button>
        </div>
      )}
    </div>
  );
}

export default function PortfolioPage() {
  const [tab, setTab] = useState<'active' | 'closed' | 'ledger'>('active');
  const { data } = useQuery({ queryKey: ['portfolio'], queryFn: api.portfolio, refetchInterval: 15_000 });
  if (!data) return <PageLoader />;
  const { stats, bets } = data;
  const active = bets.filter((b) => b.state === 'active');
  const closed = bets.filter((b) => b.state !== 'active');

  return (
    <div>
      <h1 className="section-title">我的下注</h1>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="总资产">
          <Money value={stats.netWorth} />
        </Stat>
        <Stat label="可用余额">
          <Money value={stats.balance} />
        </Stat>
        <Stat label="下注 / 持仓 / 冻结资金">
          <Money value={stats.staked} />
        </Stat>
        <Stat label="累计盈亏">
          <span className={stats.profit >= 0 ? 'text-yes' : 'text-no'}>
            <Money value={stats.profit} signed />
          </span>
        </Stat>
      </div>
      {data.exchangeOrders.length > 0 && (
        <Card className="mt-6 p-5">
          <h2 className="font-semibold">Polymarket 未成交订单</h2>
          <ul className="mt-3 divide-y divide-line">
            {data.exchangeOrders.map((o) => (
              <li key={o.id} className="py-3 text-sm">
                <Link to={`/market/${o.marketId}`} className="text-brand">
                  {o.question}
                </Link>
                <p className="mt-1 text-xs text-dim">
                  {o.side === 'buy' ? '买' : '卖'} {o.outcomeLabel} @ {o.price.toFixed(2)} · 剩余 {o.remaining} 份 ·{' '}
                  {o.side === 'buy' ? `冻结 ${(o.price * o.remaining).toFixed(2)} 水滴` : `冻结 ${o.remaining} 份`}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {data.exchangePositions.length > 0 && (
        <Card className="mt-6 p-5">
          <h2 className="font-semibold">Polymarket 份额</h2>
          <p className="mt-1 text-xs text-faint">持有数量包含卖单冻结份额；已结算份额仅作历史记录，兑付见资金流水。</p>
          <ul className="mt-3 divide-y divide-line">
            {data.exchangePositions.map((p) => (
              <li key={p.outcomeId} className="flex justify-between gap-3 py-3 text-sm">
                <Link to={`/market/${p.marketId}`} className="min-w-0 truncate text-brand">
                  {p.question} · {p.outcomeLabel}
                </Link>
                <span className="shrink-0 font-mono">
                  {p.quantity} 份 · {p.status === 'open' || p.status === 'closed' ? `冻结 ${p.reserved}` : '已结算'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card className="mt-6 p-5">
        <Segmented
          variant="tabs"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'active', label: `等待结果 ${active.length || ''}` },
            { value: 'closed', label: '已结束' },
            { value: 'ledger', label: '资金流水' },
          ]}
        />
        <div className="mt-4">
          {tab === 'active' && <BetsTable bets={active} empty="还没有下注，去市场里看看吧" />}
          {tab === 'closed' && <BetsTable bets={closed} empty="还没有已结束的下注" />}
          {tab === 'ledger' && <Ledger />}
        </div>
      </Card>
    </div>
  );
}
