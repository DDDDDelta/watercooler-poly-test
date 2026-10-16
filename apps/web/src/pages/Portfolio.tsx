import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { LedgerKind } from '@watercooler/shared';
import clsx from 'clsx';
import { useState } from 'react';
import { Link } from 'react-router';
import { Money } from '../components/Money';
import { PositionsTable } from '../components/PositionsTable';
import { Button, Card, PageLoader, Segmented, Stat } from '../components/ui';
import { api } from '../lib/api';
import { formatDate, formatSigned } from '../lib/format';

const LEDGER_LABEL: Record<LedgerKind, string> = {
  signup: '注册奖励',
  bonus: '每日签到',
  grant: '管理员发放',
  buy: '买入',
  sell: '卖出',
  payout: '结算兑付',
  refund: '取消退款',
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
  const { stats, positions } = data;
  const active = positions.filter((p) => p.state === 'active');
  const closed = positions.filter((p) => p.state !== 'active');

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">我的持仓</h1>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="总资产">
          <Money value={stats.netWorth} />
        </Stat>
        <Stat label="可用余额">
          <Money value={stats.balance} />
        </Stat>
        <Stat label="持仓市值">
          <Money value={stats.positionsValue} />
        </Stat>
        <Stat label="累计盈亏">
          <span className={stats.profit >= 0 ? 'text-yes' : 'text-no'}>
            <Money value={stats.profit} signed />
          </span>
        </Stat>
      </div>
      <Card className="mt-6 p-5">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'active', label: `当前持仓 ${active.length || ''}` },
            { value: 'closed', label: '已结束' },
            { value: 'ledger', label: '资金流水' },
          ]}
        />
        <div className="mt-4">
          {tab === 'active' && <PositionsTable positions={active} empty="还没有持仓，去市场里看看吧" />}
          {tab === 'closed' && <PositionsTable positions={closed} empty="还没有已结束的持仓" />}
          {tab === 'ledger' && <Ledger />}
        </div>
      </Card>
    </div>
  );
}
