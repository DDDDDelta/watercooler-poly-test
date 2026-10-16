import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Crown, Medal, Trophy } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Avatar } from '../components/Avatar';
import { Money } from '../components/Money';
import { Card, PageLoader, Segmented } from '../components/ui';
import { api, type LeaderboardSort } from '../lib/api';
import { useMe } from '../lib/auth';
import { formatSigned } from '../lib/format';

const PODIUM = [
  {
    ring: 'from-slate-200 to-slate-500',
    glow: 'rgb(203 213 225 / 0.35)',
    icon: Medal,
    color: 'text-slate-300',
    h: 'sm:mt-8',
  },
  { ring: 'bg-amber-400', glow: 'rgb(251 191 36 / 0.3)', icon: Crown, color: 'text-gold', h: '' },
  {
    ring: 'from-orange-300 to-orange-600',
    glow: 'rgb(251 146 60 / 0.35)',
    icon: Medal,
    color: 'text-orange-400',
    h: 'sm:mt-12',
  },
];

export default function Leaderboard() {
  const { me } = useMe();
  const [sort, setSort] = useState<LeaderboardSort>('profit');
  const { data } = useQuery({ queryKey: ['leaderboard', sort], queryFn: () => api.leaderboard(sort) });
  if (!data) return <PageLoader />;
  const metric = (e: (typeof data)[number]) =>
    sort === 'profit' ? (
      <span className={e.stats.profit >= 0 ? 'text-yes' : 'text-no'}>{formatSigned(e.stats.profit)}</span>
    ) : sort === 'netWorth' ? (
      <Money value={e.stats.netWorth} />
    ) : (
      <span>{e.stats.tradeCount} 笔</span>
    );
  const top = data.slice(0, 3);
  // Display order: 2nd, 1st, 3rd
  const podium = [top[1], top[0], top[2]];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-bold">
            <Trophy className="size-7 text-gold" /> 预言家排行榜
          </h1>
          <p className="mt-1 text-dim">谁才是茶水间最准的那张嘴</p>
        </div>
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { value: 'profit', label: '盈利' },
            { value: 'netWorth', label: '总资产' },
            { value: 'volume', label: '交易次数' },
          ]}
        />
      </div>

      <div className="mt-10 grid grid-cols-3 items-start gap-3 sm:gap-6">
        {podium.map((e, i) =>
          e ? (
            <Link key={e.user.id} to={`/u/${e.user.id}`} className={clsx('group', PODIUM[i]!.h)}>
              <Card className="glow-border relative flex flex-col items-center px-2 py-6 text-center transition group-hover:-translate-y-1">
                <div
                  className={clsx('rounded-full p-[3px]', PODIUM[i]!.ring)}
                  style={{ boxShadow: `0 0 40px ${PODIUM[i]!.glow}` }}
                >
                  <Avatar
                    id={e.user.id}
                    name={e.user.displayName}
                    size={i === 1 ? 76 : 60}
                    className="ring-4 ring-canvas"
                  />
                </div>
                {(() => {
                  const Icon = PODIUM[i]!.icon;
                  return <Icon className={clsx('mt-3 size-5', PODIUM[i]!.color)} />;
                })()}
                <div className="mt-1 max-w-full truncate font-semibold">{e.user.displayName}</div>
                <div className="mt-1 font-mono text-sm sm:text-base">{metric(e)}</div>
              </Card>
            </Link>
          ) : (
            <div key={i} />
          ),
        )}
      </div>

      <Card className="mt-8 overflow-hidden">
        {data.slice(3).map((e) => (
          <Link
            key={e.user.id}
            to={`/u/${e.user.id}`}
            className={clsx(
              'flex items-center gap-4 border-b border-line px-5 py-3 transition last:border-0 hover:bg-white/[0.03]',
              e.user.id === me?.id && 'bg-brand/[0.08]',
            )}
          >
            <span className="w-6 text-center font-display font-semibold text-faint">{e.rank}</span>
            <Avatar id={e.user.id} name={e.user.displayName} size={34} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">
                {e.user.displayName} {e.user.id === me?.id && <span className="text-xs text-brand">（你）</span>}
              </div>
              <div className="text-xs text-faint">
                {e.stats.tradeCount} 笔交易 · {e.stats.marketsTraded} 个市场
              </div>
            </div>
            <div className="text-right font-mono tabular">{metric(e)}</div>
          </Link>
        ))}
        {data.length <= 3 && <div className="py-8 text-center text-sm text-faint">人还不够多，快拉同事来玩</div>}
      </Card>
    </div>
  );
}
