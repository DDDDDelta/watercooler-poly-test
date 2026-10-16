import { useQuery } from '@tanstack/react-query';
import { CATEGORIES, CURRENCY_NAME, type MarketSummary } from '@watercooler/shared';
import clsx from 'clsx';
import { ArrowUpRight, Flame, Plus, Search, Sparkles, TrendingUp, Trophy } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Avatar } from '../components/Avatar';
import { CategoryIcon } from '../components/CategoryIcon';
import { MarketCard, MarketCardSkeleton } from '../components/MarketCard';
import { Money } from '../components/Money';
import { buttonClass, Card, Empty, Segmented } from '../components/ui';
import { api, type MarketFilter, type MarketSort } from '../lib/api';
import { useConfig, useMe } from '../lib/auth';
import { outcomeColor } from '../lib/colors';
import { formatCompact, formatPct, formatRelative, formatSigned } from '../lib/format';

const PriceChart = lazy(() => import('../components/PriceChart'));

function FeaturedMarket({ market }: { market: MarketSummary }) {
  const navigate = useNavigate();
  const { data: history } = useQuery({
    queryKey: ['history', market.id, 'all'],
    queryFn: () => api.history(market.id, 'all'),
  });
  const lead = market.isBinary
    ? market.outcomes[0]!
    : [...market.outcomes].sort((a, b) => b.probability - a.probability)[0]!;
  const color = outcomeColor(lead.index, market.isBinary);

  return (
    <Card className="glow-border relative flex h-full flex-col overflow-hidden p-5">
      <div
        className="pointer-events-none absolute -top-20 -right-20 size-64 rounded-full opacity-25 blur-3xl"
        style={{ background: color }}
      />
      <div className="relative flex items-center gap-2 text-xs font-medium text-gold">
        <Flame className="size-3.5" /> 今日最热
      </div>
      <Link to={`/market/${market.id}`} className="relative mt-3 flex items-start gap-3">
        <CategoryIcon category={market.category} size={44} />
        <h2 className="flex-1 font-display text-xl leading-snug font-semibold hover:underline hover:decoration-white/30 hover:underline-offset-4">
          {market.question}
        </h2>
      </Link>
      <div className="relative mt-4 flex items-end gap-3">
        <span className="font-display text-4xl font-bold tabular" style={{ color, textShadow: `0 0 24px ${color}66` }}>
          {formatPct(lead.probability)}
        </span>
        <span className="pb-1.5 text-sm text-dim">{market.isBinary && lead.label === '是' ? '概率' : lead.label}</span>
        {lead.change24h !== null && Math.abs(lead.change24h) >= 0.005 && (
          <span className={clsx('pb-1.5 font-mono text-sm', lead.change24h > 0 ? 'text-yes' : 'text-no')}>
            {lead.change24h > 0 ? '▲' : '▼'} {formatSigned(lead.change24h * 100, 0)}%
          </span>
        )}
      </div>
      <div className="relative mt-2 h-40 min-h-40 flex-1">
        {history && (
          <Suspense fallback={null}>
            <PriceChart market={market} points={history} />
          </Suspense>
        )}
      </div>
      <div className="relative mt-3 flex flex-wrap gap-2">
        {(market.isBinary
          ? market.outcomes
          : market.outcomes
              .slice()
              .sort((a, b) => b.probability - a.probability)
              .slice(0, 3)
        ).map((o) => {
          const c = outcomeColor(o.index, market.isBinary);
          return (
            <button
              key={o.id}
              onClick={() => navigate(`/market/${market.id}?outcome=${o.id}`)}
              className="flex flex-1 items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition hover:brightness-125"
              style={{ borderColor: `${c}40`, background: `${c}14`, color: c }}
            >
              <span className="truncate">买 {o.label}</span>
              <span className="font-mono text-xs">{formatPct(o.probability)}</span>
            </button>
          );
        })}
      </div>
      <div className="relative mt-3 flex items-center gap-3 text-xs text-faint">
        <Money value={market.volume} compact className="text-dim" /> 成交
        <span>·</span>
        <span>{market.traderCount} 人参与</span>
        <span className="ml-auto">{formatRelative(market.closeAt)}截止</span>
      </div>
    </Card>
  );
}

function Hero() {
  const { me } = useMe();
  const config = useConfig();
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: api.stats });
  const { data: trending } = useQuery({
    queryKey: ['markets', { sort: 'trending', limit: 1 }],
    queryFn: () => api.markets({ sort: 'trending', limit: 1 }),
  });
  const featured = trending?.[0];

  return (
    <section className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
      <div className="flex flex-col justify-center py-4 lg:py-10">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3 py-1 text-xs text-dim">
          <span className="size-1.5 animate-pulse-ring rounded-full bg-yes" />
          {stats ? `${stats.openMarkets} 个市场正在交易` : '实时交易中'}
        </div>
        <h1 className="mt-5 font-display text-4xl leading-[1.1] font-bold tracking-tight sm:text-5xl lg:text-6xl">
          把茶水间的八卦
          <br />
          变成<span className="text-aurora">概率</span>
        </h1>
        <p className="mt-5 max-w-lg text-base leading-relaxed text-dim">
          团建去哪、周会多久、指数收在几点……用{CURRENCY_NAME}押注你的判断。价格就是大家的集体预期，猜对了，
          {CURRENCY_NAME}归你。
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <a href="#markets" className={buttonClass({ size: 'lg' })}>
            <TrendingUp className="size-4" />
            开始预测
          </a>
          <Link to={me ? '/create' : '/register'} className={buttonClass({ size: 'lg', variant: 'outline' })}>
            {me ? <Plus className="size-4" /> : <Sparkles className="size-4" />}
            {me ? '发起一个市场' : `注册领 ${config?.startingBalance ?? 1000} ${CURRENCY_NAME}`}
          </Link>
        </div>
        {stats && (
          <dl className="mt-10 grid max-w-md grid-cols-3 gap-6">
            {[
              ['活跃市场', String(stats.openMarkets)],
              ['总成交', formatCompact(stats.totalVolume)],
              ['参与人数', String(stats.traders)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-faint">{label}</dt>
                <dd className="mt-1 font-display text-2xl font-semibold tabular">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div className="min-h-[420px]">
        {featured ? (
          <FeaturedMarket market={featured} />
        ) : (
          <Card className="flex h-full items-center justify-center p-6">
            <Empty icon={<Sparkles className="size-10" />} title="还没有市场">
              {me ? '来创建第一个吧' : '登录后创建第一个市场'}
            </Empty>
          </Card>
        )}
      </div>
    </section>
  );
}

const FILTERS: { value: MarketFilter; label: string }[] = [
  { value: 'active', label: '进行中' },
  { value: 'closed', label: '待结算' },
  { value: 'resolved', label: '已结束' },
];

const SORTS: { value: MarketSort; label: string }[] = [
  { value: 'trending', label: '热门' },
  { value: 'volume', label: '成交量' },
  { value: 'new', label: '最新' },
  { value: 'closing', label: '即将截止' },
];

function MarketBrowser() {
  const [params, setParams] = useSearchParams();
  const category = params.get('cat') ?? '';
  const filter = (params.get('status') as MarketFilter) || 'active';
  const sort = (params.get('sort') as MarketSort) || 'trending';
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(search);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const update = (key: string, value: string) =>
    setParams(
      (p) => {
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { replace: true, preventScrollReset: true },
    );

  const query = { filter, sort, category: category || undefined, q: debounced || undefined };
  const { data, isPending } = useQuery({
    queryKey: ['markets', query],
    queryFn: () => api.markets(query),
    refetchInterval: 20_000,
  });

  return (
    <section id="markets" className="scroll-mt-24">
      <div className="mt-12 flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0 lg:pb-0">
          {['', ...CATEGORIES].map((c) => (
            <button
              key={c || 'all'}
              onClick={() => update('cat', c)}
              className={clsx(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition',
                category === c
                  ? 'border-transparent bg-fg text-canvas'
                  : 'border-line text-dim hover:border-line-strong hover:text-fg',
              )}
            >
              {c || '全部'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <div className="relative min-w-0 flex-1 lg:w-56 lg:flex-none">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                update('q', e.target.value.trim());
              }}
              placeholder="搜索市场"
              className="h-9 w-full rounded-xl border border-line bg-white/[0.03] pr-3 pl-9 text-sm outline-none placeholder:text-faint focus:border-brand-2/60"
            />
          </div>
          <Segmented
            size="sm"
            value={filter}
            onChange={(v) => update('status', v === 'active' ? '' : v)}
            options={FILTERS}
          />
          <select
            value={sort}
            onChange={(e) => update('sort', e.target.value === 'trending' ? '' : e.target.value)}
            className="h-9 rounded-xl border border-line bg-panel px-3 text-sm text-dim outline-none focus:border-brand-2/60"
            aria-label="排序"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {isPending
          ? Array.from({ length: 8 }, (_, i) => <MarketCardSkeleton key={i} />)
          : data?.map((m) => <MarketCard key={m.id} market={m} />)}
      </div>
      {data && data.length === 0 && (
        <Empty icon={<Search className="size-10" />} title="没有找到市场">
          换个筛选条件试试，或者自己发起一个
        </Empty>
      )}
    </section>
  );
}

function BottomPanels() {
  const { data: activity } = useQuery({ queryKey: ['activity'], queryFn: () => api.activity(24) });
  const { data: board } = useQuery({ queryKey: ['leaderboard', 'profit'], queryFn: () => api.leaderboard('profit') });
  return (
    <section className="mt-14 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <span className="size-2 animate-pulse-ring rounded-full bg-yes" /> 最新成交
        </h2>
        <ul className="mt-4 divide-y divide-line">
          {activity?.slice(0, 8).map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
              <Link to={`/u/${t.user.id}`}>
                <Avatar id={t.user.id} name={t.user.displayName} size={28} />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="truncate">
                  <Link to={`/u/${t.user.id}`} className="font-medium hover:underline">
                    {t.user.displayName}
                  </Link>{' '}
                  <span className={t.side === 'buy' ? 'text-yes' : 'text-no'}>
                    {t.side === 'buy' ? '买入' : '卖出'}
                  </span>{' '}
                  <span className="text-fg/80">「{t.outcomeLabel}」</span>
                </div>
                <Link to={`/market/${t.marketId}`} className="block truncate text-xs text-faint hover:text-dim">
                  {t.marketQuestion}
                </Link>
              </div>
              <div className="text-right">
                <Money value={t.amount} className="font-mono text-sm" />
                <div className="text-xs text-faint">{formatRelative(t.createdAt)}</div>
              </div>
            </li>
          ))}
          {activity?.length === 0 && <li className="py-6 text-center text-sm text-faint">还没有人交易</li>}
        </ul>
      </Card>
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Trophy className="size-4 text-gold" /> 预言家榜
          </h2>
          <Link to="/leaderboard" className="flex items-center gap-0.5 text-xs text-dim hover:text-fg">
            全部 <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
        <ol className="mt-4 space-y-1">
          {board?.slice(0, 6).map((e) => (
            <li key={e.user.id}>
              <Link
                to={`/u/${e.user.id}`}
                className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.04]"
              >
                <span
                  className={clsx(
                    'w-5 text-center font-display text-sm font-bold',
                    e.rank === 1
                      ? 'text-gold'
                      : e.rank === 2
                        ? 'text-slate-300'
                        : e.rank === 3
                          ? 'text-orange-400'
                          : 'text-faint',
                  )}
                >
                  {e.rank}
                </span>
                <Avatar id={e.user.id} name={e.user.displayName} size={28} />
                <span className="flex-1 truncate text-sm font-medium">{e.user.displayName}</span>
                <span className={clsx('font-mono text-sm tabular', e.stats.profit >= 0 ? 'text-yes' : 'text-no')}>
                  {formatSigned(e.stats.profit, 0)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}

export default function Home() {
  return (
    <>
      <Hero />
      <MarketBrowser />
      <BottomPanels />
    </>
  );
}
