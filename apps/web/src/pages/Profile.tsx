import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { CalendarDays, Shield } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Avatar } from '../components/Avatar';
import { MarketCard } from '../components/MarketCard';
import { Money } from '../components/Money';
import { PositionsTable } from '../components/PositionsTable';
import { Card, Empty, PageLoader, Segmented, Stat } from '../components/ui';
import { api } from '../lib/api';
import { formatDay, formatRelative, formatShares } from '../lib/format';

export default function Profile() {
  const id = Number(useParams().id);
  const [tab, setTab] = useState<'positions' | 'trades' | 'markets'>('positions');
  const { data, error } = useQuery({ queryKey: ['user', id], queryFn: () => api.user(id) });
  if (error) return <Empty title="用户不存在" />;
  if (!data) return <PageLoader />;
  const { user, stats, rank, positions, trades, createdMarkets } = data;

  return (
    <div>
      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -top-32 -right-20 size-80 rounded-full bg-brand/25 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-5">
          <div className="rounded-full bg-aurora p-[3px] shadow-[0_0_40px_-6px_rgb(139_92_246)]">
            <Avatar id={user.id} name={user.displayName} size={84} className="ring-4 ring-canvas" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 font-display text-3xl font-bold">
              {user.displayName}
              {user.role === 'admin' && (
                <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-xs font-medium text-gold">
                  <Shield className="size-3" /> 管理员
                </span>
              )}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-dim">
              <span>@{user.username}</span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-4" /> {formatDay(user.createdAt)} 加入
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-faint">排名</div>
            <div className="text-aurora font-display text-5xl font-bold">#{rank}</div>
          </div>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="总资产">
          <Money value={stats.netWorth} />
        </Stat>
        <Stat label="累计盈亏">
          <span className={stats.profit >= 0 ? 'text-yes' : 'text-no'}>
            <Money value={stats.profit} signed />
          </span>
        </Stat>
        <Stat label="交易次数">{stats.tradeCount}</Stat>
        <Stat label="参与市场">{stats.marketsTraded}</Stat>
      </div>

      <Card className="mt-6 p-5">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'positions', label: '持仓' },
            { value: 'trades', label: '交易记录' },
            { value: 'markets', label: `发起的市场 ${createdMarkets.length || ''}` },
          ]}
        />
        <div className="mt-4">
          {tab === 'positions' && <PositionsTable positions={positions} empty="暂无持仓" />}
          {tab === 'trades' &&
            (trades.length === 0 ? (
              <Empty title="还没有交易" />
            ) : (
              <ul className="divide-y divide-line">
                {trades.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-3 text-sm">
                    <span
                      className={clsx(
                        'rounded-md px-2 py-0.5 text-xs font-semibold',
                        t.side === 'buy' ? 'bg-yes/10 text-yes' : 'bg-no/10 text-no',
                      )}
                    >
                      {t.side === 'buy' ? '买入' : '卖出'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link to={`/market/${t.marketId}`} className="line-clamp-1 hover:underline">
                        {t.marketQuestion}
                      </Link>
                      <div className="text-xs text-faint">
                        {formatShares(t.shares)} 份「{t.outcomeLabel}」 · {formatRelative(t.createdAt)}
                      </div>
                    </div>
                    <Money value={t.amount} className="font-mono" />
                  </li>
                ))}
              </ul>
            ))}
          {tab === 'markets' &&
            (createdMarkets.length === 0 ? (
              <Empty title="还没有发起过市场" />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {createdMarkets.map((m) => (
                  <MarketCard key={m.id} market={m} />
                ))}
              </div>
            ))}
        </div>
      </Card>
    </div>
  );
}
