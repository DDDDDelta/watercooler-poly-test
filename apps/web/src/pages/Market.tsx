import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MarketDetail, MarketPosition } from '@watercooler/shared';
import clsx from 'clsx';
import { Ban, CalendarClock, ChevronLeft, Crown, Gavel, MessageCircle, ScrollText, Trash2, Users } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Avatar } from '../components/Avatar';
import { CategoryIcon } from '../components/CategoryIcon';
import { Money } from '../components/Money';
import { StatusBadge } from '../components/StatusBadge';
import { TradePanel } from '../components/TradePanel';
import { Badge, Button, Card, Empty, Modal, PageLoader, Segmented, Spinner, Textarea } from '../components/ui';
import { api, errorMessage, type HistoryRange } from '../lib/api';
import { useMe } from '../lib/auth';
import { outcomeColor } from '../lib/colors';
import {
  formatDate,
  formatMoney,
  formatPct,
  formatPct1,
  formatRelative,
  formatShares,
  formatSigned,
} from '../lib/format';

const PriceChart = lazy(() => import('../components/PriceChart'));

function ChartCard({ market }: { market: MarketDetail }) {
  const [range, setRange] = useState<HistoryRange>('all');
  const { data, isPending } = useQuery({
    queryKey: ['history', market.id, range],
    queryFn: () => api.history(market.id, range),
    refetchInterval: market.status === 'open' ? 15_000 : false,
  });
  const lead = market.outcomes[0]!;
  const sorted = [...market.outcomes].sort((a, b) => b.probability - a.probability);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {market.isBinary ? (
          <div className="flex items-end gap-3">
            <span
              className="font-display text-5xl font-bold tabular"
              style={{ color: outcomeColor(0, true), textShadow: `0 0 30px ${outcomeColor(0, true)}55` }}
            >
              {formatPct(lead.probability)}
            </span>
            <span className="pb-2 text-sm text-dim">{lead.label === '是' ? '概率' : lead.label}</span>
            {lead.change24h !== null && Math.abs(lead.change24h) >= 0.001 && (
              <span className={clsx('pb-2 font-mono text-sm', lead.change24h > 0 ? 'text-yes' : 'text-no')}>
                {lead.change24h > 0 ? '▲' : '▼'} {formatSigned(lead.change24h * 100, 1)}% 24h
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {sorted.slice(0, 6).map((o) => (
              <span key={o.id} className="inline-flex items-center gap-1.5 text-sm">
                <span className="size-2 rounded-full" style={{ background: outcomeColor(o.index, false) }} />
                <span className="text-dim">{o.label}</span>
                <span className="font-mono font-semibold">{formatPct(o.probability)}</span>
              </span>
            ))}
          </div>
        )}
        <Segmented
          size="sm"
          value={range}
          onChange={setRange}
          options={[
            { value: '1d', label: '1天' },
            { value: '1w', label: '1周' },
            { value: '1m', label: '1月' },
            { value: 'all', label: '全部' },
          ]}
        />
      </div>
      <div className="mt-4 h-72">
        {isPending || !data ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <Suspense fallback={null}>
            <PriceChart market={market} points={data} />
          </Suspense>
        )}
      </div>
    </Card>
  );
}

function OutcomeTable({
  market,
  selected,
  onSelect,
}: {
  market: MarketDetail;
  selected: number;
  onSelect: (id: number) => void;
}) {
  const sorted = [...market.outcomes].sort((a, b) => b.probability - a.probability);
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-line px-5 py-2.5 text-xs text-faint">
        <span>选项</span>
        <span className="w-20 text-right">概率</span>
        <span className="w-20" />
      </div>
      {sorted.map((o) => {
        const c = outcomeColor(o.index, market.isBinary);
        const isWinner = market.resolvedOutcomeId === o.id;
        return (
          <div
            key={o.id}
            className={clsx(
              'relative grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-line px-5 py-3.5 transition last:border-0',
              selected === o.id ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]',
            )}
          >
            <div
              className="absolute inset-y-0 left-0 opacity-[0.07] transition-all duration-500"
              style={{ width: `${o.probability * 100}%`, background: c }}
            />
            <div className="relative flex min-w-0 items-center gap-3">
              <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: c, boxShadow: `0 0 10px ${c}` }} />
              <span className="truncate font-medium">{o.label}</span>
              {isWinner && <Crown className="size-4 shrink-0 text-gold" />}
              {o.change24h !== null && Math.abs(o.change24h) >= 0.005 && (
                <span className={clsx('shrink-0 font-mono text-xs', o.change24h > 0 ? 'text-yes' : 'text-no')}>
                  {o.change24h > 0 ? '▲' : '▼'}
                  {Math.abs(Math.round(o.change24h * 100))}
                </span>
              )}
            </div>
            <span className="relative w-20 text-right font-display text-xl font-semibold tabular">
              {formatPct(o.probability)}
            </span>
            <div className="relative w-20 text-right">
              {market.status === 'open' && (
                <button
                  onClick={() => onSelect(o.id)}
                  className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:brightness-125"
                  style={{ borderColor: `${c}55`, background: `${c}1a`, color: c }}
                >
                  买入
                </button>
              )}
            </div>
          </div>
        );
      })}
    </Card>
  );
}

function ResolutionBanner({ market }: { market: MarketDetail }) {
  if (market.status === 'open') return null;
  const winner = market.outcomes.find((o) => o.id === market.resolvedOutcomeId);
  const styles = {
    closed: 'border-gold/30 bg-gold/[0.07] text-gold',
    resolved: 'border-brand-2/30 bg-brand-2/[0.07] text-brand-2',
    cancelled: 'border-line-strong bg-white/[0.03] text-dim',
  }[market.status];
  return (
    <div className={clsx('flex items-start gap-3 rounded-2xl border p-4', styles)}>
      {market.status === 'resolved' ? (
        <Crown className="mt-0.5 size-5 shrink-0" />
      ) : market.status === 'cancelled' ? (
        <Ban className="mt-0.5 size-5 shrink-0" />
      ) : (
        <CalendarClock className="mt-0.5 size-5 shrink-0" />
      )}
      <div className="text-sm">
        <div className="font-semibold">
          {market.status === 'resolved'
            ? `已结算：「${winner?.label}」`
            : market.status === 'cancelled'
              ? '市场已取消，投入已退回'
              : '交易已截止，等待结算'}
        </div>
        {market.resolutionNote && <div className="mt-1 text-fg/70">{market.resolutionNote}</div>}
        {market.resolvedBy && market.resolvedAt && (
          <div className="mt-1 text-xs opacity-70">
            {market.resolvedBy.displayName} · {formatDate(market.resolvedAt)}
          </div>
        )}
      </div>
    </div>
  );
}

function Comments({ marketId }: { marketId: number }) {
  const { me } = useMe();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const { data } = useQuery({ queryKey: ['comments', marketId], queryFn: () => api.comments(marketId) });
  const add = useMutation({
    mutationFn: () => api.addComment(marketId, body.trim()),
    onSuccess: () => {
      setBody('');
      void qc.invalidateQueries({ queryKey: ['comments', marketId] });
      void qc.invalidateQueries({ queryKey: ['market', marketId] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteComment(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['comments', marketId] }),
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div>
      {me ? (
        <div className="flex gap-3">
          <Avatar id={me.id} name={me.displayName} size={36} />
          <div className="flex-1">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="说说你的判断依据……"
              maxLength={1000}
              className="min-h-20"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && body.trim()) add.mutate();
              }}
            />
            <div className="mt-2 flex items-center justify-end gap-3">
              <span className="text-xs text-faint">Ctrl/⌘ + Enter 发送</span>
              <Button size="sm" disabled={!body.trim()} loading={add.isPending} onClick={() => add.mutate()}>
                发表
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-faint">
          <Link to="/login" className="text-brand-2 hover:underline">
            登录
          </Link>{' '}
          后参与讨论
        </div>
      )}
      <ul className="mt-6 space-y-5">
        {data?.map((c) => (
          <li key={c.id} className="group flex gap-3">
            <Link to={`/u/${c.user.id}`}>
              <Avatar id={c.user.id} name={c.user.displayName} size={36} />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm">
                <Link to={`/u/${c.user.id}`} className="font-medium hover:underline">
                  {c.user.displayName}
                </Link>
                <span className="text-xs text-faint">{formatRelative(c.createdAt)}</span>
                {me && (me.id === c.user.id || me.role === 'admin') && (
                  <button
                    onClick={() => remove.mutate(c.id)}
                    className="ml-auto text-faint opacity-0 transition group-hover:opacity-100 hover:text-no"
                    aria-label="删除评论"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-1 text-sm leading-relaxed break-words whitespace-pre-wrap text-fg/85">{c.body}</p>
            </div>
          </li>
        ))}
        {data?.length === 0 && <li className="py-6 text-center text-sm text-faint">还没有评论，来抢沙发</li>}
      </ul>
    </div>
  );
}

function Holders({ market }: { market: MarketDetail }) {
  const { data } = useQuery({ queryKey: ['holders', market.id], queryFn: () => api.holders(market.id) });
  if (!data) return <Spinner />;
  if (data.length === 0) return <Empty title="还没有人持仓" />;
  const groups = market.outcomes
    .map((o) => ({ outcome: o, holders: data.filter((h) => h.outcomeId === o.id) }))
    .filter((g) => g.holders.length);
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {groups.map(({ outcome, holders }) => (
        <div key={outcome.id}>
          <div
            className="mb-2 flex items-center gap-2 text-sm font-semibold"
            style={{ color: outcomeColor(outcome.index, market.isBinary) }}
          >
            {outcome.label} 持有者
          </div>
          <ul className="space-y-1">
            {holders.map((h) => (
              <li key={h.user.id}>
                <Link
                  to={`/u/${h.user.id}`}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-white/[0.04]"
                >
                  <Avatar id={h.user.id} name={h.user.displayName} size={24} />
                  <span className="flex-1 truncate">{h.user.displayName}</span>
                  <span className="font-mono text-xs text-dim">{formatShares(h.shares)} 份</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function TradeHistory({ market }: { market: MarketDetail }) {
  const { data } = useQuery({ queryKey: ['marketTrades', market.id], queryFn: () => api.marketTrades(market.id) });
  if (!data) return <Spinner />;
  if (data.length === 0) return <Empty title="还没有成交" />;
  return (
    <ul className="divide-y divide-line">
      {data.map((t) => (
        <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
          <Avatar id={t.user.id} name={t.user.displayName} size={26} />
          <div className="min-w-0 flex-1 truncate">
            <Link to={`/u/${t.user.id}`} className="font-medium hover:underline">
              {t.user.displayName}
            </Link>{' '}
            <span className={t.side === 'buy' ? 'text-yes' : 'text-no'}>{t.side === 'buy' ? '买入' : '卖出'}</span>{' '}
            <span className="font-mono text-dim">{formatShares(t.shares)}</span> 份{' '}
            <span
              style={{
                color: outcomeColor(market.outcomes.find((o) => o.id === t.outcomeId)?.index ?? 0, market.isBinary),
              }}
            >
              {t.outcomeLabel}
            </span>
          </div>
          <Money value={t.amount} className="font-mono" />
          <span className="w-16 text-right text-xs text-faint">{formatRelative(t.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}

function MyPosition({ market, positions }: { market: MarketDetail; positions: MarketPosition[] }) {
  if (positions.length === 0) return null;
  return (
    <Card className="p-5">
      <h3 className="mb-3 text-sm font-semibold text-dim">我的持仓</h3>
      <div className="space-y-3">
        {positions.map((p) => {
          const o = market.outcomes.find((x) => x.id === p.outcomeId)!;
          const value = p.shares * o.probability;
          const pnl = value - p.cost;
          return (
            <div key={p.outcomeId} className="rounded-xl border border-line bg-black/15 p-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold" style={{ color: outcomeColor(o.index, market.isBinary) }}>
                  {o.label}
                </span>
                <span className="font-mono text-sm">{formatShares(p.shares)} 份</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-faint">均价</div>
                  <div className="font-mono">{formatPct1(p.cost / p.shares)}</div>
                </div>
                <div>
                  <div className="text-faint">市值</div>
                  <div className="font-mono">{formatMoney(value)}</div>
                </div>
                <div>
                  <div className="text-faint">盈亏</div>
                  <div className={clsx('font-mono', pnl >= 0 ? 'text-yes' : 'text-no')}>{formatSigned(pnl)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function AdminPanel({ market }: { market: MarketDetail }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'resolve' | 'cancel' | null>(null);
  const [outcomeId, setOutcomeId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      mode === 'resolve'
        ? api.resolve(market.id, outcomeId!, note.trim() || undefined)
        : api.cancel(market.id, note.trim() || undefined),
    onSuccess: () => {
      toast.success(mode === 'resolve' ? '已结算，奖金已发放' : '已取消，投入已退回');
      setMode(null);
      void qc.invalidateQueries();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  if (market.status === 'resolved' || market.status === 'cancelled') return null;

  return (
    <Card className="border-gold/20 p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gold">
        <Gavel className="size-4" /> 管理员操作
      </h3>
      <p className="mt-1.5 text-xs leading-relaxed text-faint">
        结算后每份获胜份额兑付 1 水滴；取消则按每人净投入退款。操作不可撤销。
      </p>
      <div className="mt-4 flex gap-2">
        <Button size="sm" className="flex-1" onClick={() => setMode('resolve')}>
          结算
        </Button>
        <Button size="sm" variant="danger" className="flex-1" onClick={() => setMode('cancel')}>
          取消市场
        </Button>
      </div>
      <Modal open={mode !== null} onClose={() => setMode(null)} title={mode === 'resolve' ? '结算市场' : '取消市场'}>
        {mode === 'resolve' && (
          <div className="space-y-2">
            <div className="text-sm text-dim">选择最终结果</div>
            {market.outcomes.map((o) => (
              <button
                key={o.id}
                onClick={() => setOutcomeId(o.id)}
                className={clsx(
                  'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-medium transition',
                  outcomeId === o.id ? 'border-brand-2 bg-brand-2/10' : 'border-line hover:bg-white/[0.04]',
                )}
              >
                {o.label}
                <span className="font-mono text-xs text-faint">{formatPct(o.probability)}</span>
              </button>
            ))}
          </div>
        )}
        <Textarea
          className="mt-4"
          placeholder={mode === 'resolve' ? '结算说明（可选），比如依据来源' : '取消原因（可选）'}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button
          className="mt-4 w-full"
          variant={mode === 'cancel' ? 'danger' : 'primary'}
          disabled={mode === 'resolve' && outcomeId === null}
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          确认{mode === 'resolve' ? '结算' : '取消'}
        </Button>
      </Modal>
    </Card>
  );
}

export default function Market() {
  const id = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const { me } = useMe();
  const [tab, setTab] = useState<'comments' | 'holders' | 'trades'>('comments');
  const { data, isPending, error } = useQuery({
    queryKey: ['market', id],
    queryFn: () => api.market(id),
    refetchInterval: 10_000,
  });
  const [outcomeId, setOutcomeId] = useState<number | null>(null);

  useEffect(() => {
    const fromUrl = Number(params.get('outcome'));
    if (fromUrl) setOutcomeId(fromUrl);
  }, [params]);

  if (isPending) return <PageLoader />;
  if (error || !data) return <Empty title="市场不存在或已被删除" />;
  const { market, positions } = data;
  const selected = outcomeId && market.outcomes.some((o) => o.id === outcomeId) ? outcomeId : market.outcomes[0]!.id;

  const selectOutcome = (oid: number) => {
    setOutcomeId(oid);
    setParams((p) => (p.set('outcome', String(oid)), p), { replace: true, preventScrollReset: true });
    if (window.innerWidth < 1024)
      document.getElementById('trade')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-dim hover:text-fg">
          <ChevronLeft className="size-4" /> 全部市场
        </Link>
        <header className="flex items-start gap-4">
          <CategoryIcon category={market.category} size={60} className="hidden sm:inline-flex" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{market.category}</Badge>
              <StatusBadge market={market} />
            </div>
            <h1 className="mt-2 font-display text-2xl leading-tight font-bold sm:text-3xl">{market.question}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-dim">
              <span className="inline-flex items-center gap-1.5">
                <Money value={market.volume} /> 成交
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-4 text-faint" /> {market.traderCount} 人参与
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="size-4 text-faint" /> {formatDate(market.closeAt)} 截止
              </span>
              <Link to={`/u/${market.creator.id}`} className="inline-flex items-center gap-1.5 hover:text-fg">
                <Avatar id={market.creator.id} name={market.creator.displayName} size={18} />
                {market.creator.displayName} 发起
              </Link>
            </div>
          </div>
        </header>
        <ResolutionBanner market={market} />
        <ChartCard market={market} />
        {!market.isBinary && <OutcomeTable market={market} selected={selected} onSelect={selectOutcome} />}
      </div>

      <aside id="trade" className="space-y-4 lg:sticky lg:top-24 lg:row-span-2 lg:self-start">
        <TradePanel market={market} positions={positions} outcomeId={selected} onOutcomeChange={selectOutcome} />
        <MyPosition market={market} positions={positions} />
        {me?.role === 'admin' && <AdminPanel market={market} />}
      </aside>

      <div className="space-y-5">
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <ScrollText className="size-4 text-brand-2" /> 结算规则
          </h2>
          <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-fg/80">
            {market.description || '发起人没有填写额外说明。以常识和公开信息为准，由管理员结算。'}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-faint sm:grid-cols-4">
            <div>
              <div>创建时间</div>
              <div className="mt-0.5 text-dim">{formatDate(market.createdAt)}</div>
            </div>
            <div>
              <div>截止时间</div>
              <div className="mt-0.5 text-dim">{formatDate(market.closeAt)}</div>
            </div>
            <div>
              <div>流动性参数</div>
              <div className="mt-0.5 font-mono text-dim">b = {market.liquidity}</div>
            </div>
            <div>
              <div>选项数</div>
              <div className="mt-0.5 text-dim">{market.outcomes.length}</div>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              {
                value: 'comments',
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <MessageCircle className="size-3.5" /> 讨论 {market.commentCount > 0 && market.commentCount}
                  </span>
                ),
              },
              { value: 'holders', label: '持仓榜' },
              { value: 'trades', label: '成交记录' },
            ]}
          />
          <div className="mt-5">
            {tab === 'comments' && <Comments marketId={market.id} />}
            {tab === 'holders' && <Holders market={market} />}
            {tab === 'trades' && <TradeHistory market={market} />}
          </div>
        </Card>
      </div>
    </div>
  );
}
