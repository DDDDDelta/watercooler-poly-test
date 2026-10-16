import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CURRENCY_NAME,
  MIN_TRADE_AMOUNT,
  quoteBuy,
  quoteSell,
  type MarketDetail,
  type MarketDetailResponse,
  type MarketPosition,
} from '@watercooler/shared';
import clsx from 'clsx';
import { ArrowRight, Ban, Crown, Hourglass, Lock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { toast } from 'sonner';
import { api, errorMessage } from '../lib/api';
import { useMe, useSetMe } from '../lib/auth';
import { outcomeColor } from '../lib/colors';
import { formatMoney, formatPct, formatPct1, formatShares } from '../lib/format';
import { Drop, Money } from './Money';
import { Button, buttonClass, Card } from './ui';

/** Reject the trade if the price moves against the user by more than this between quote and fill. */
const SLIPPAGE = 0.01;

function Row({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-center justify-between gap-3 text-sm', className)}>
      <span className="text-faint">{label}</span>
      <span className="font-mono tabular text-fg/90">{children}</span>
    </div>
  );
}

export function TradePanel({
  market,
  positions,
  outcomeId,
  onOutcomeChange,
}: {
  market: MarketDetail;
  positions: MarketPosition[];
  outcomeId: number;
  onOutcomeChange: (id: number) => void;
}) {
  const { me } = useMe();
  const setMe = useSetMe();
  const qc = useQueryClient();
  const location = useLocation();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [shares, setShares] = useState('');

  const index = Math.max(
    0,
    market.outcomes.findIndex((o) => o.id === outcomeId),
  );
  const outcome = market.outcomes[index]!;
  const color = outcomeColor(outcome.index, market.isBinary);
  const position = positions.find((p) => p.outcomeId === outcome.id);
  const q = market.outcomes.map((o) => o.shares);

  useEffect(() => setShares(''), [outcomeId, side]);

  const amountNum = Number(amount);
  const sharesNum = Number(shares);
  const quote = useMemo(() => {
    if (side === 'buy') return amountNum > 0 ? quoteBuy(q, market.liquidity, index, amountNum) : null;
    return sharesNum > 0 ? quoteSell(q, market.liquidity, index, Math.min(sharesNum, position?.shares ?? 0)) : null;
  }, [side, amountNum, sharesNum, market, index, position?.shares]);

  const mutation = useMutation({
    mutationFn: () => {
      if (side === 'buy') {
        return api.trade(market.id, {
          side: 'buy',
          outcomeId: outcome.id,
          amount: amountNum,
          minShares: quote ? quote.shares * (1 - SLIPPAGE) : undefined,
        });
      }
      return api.trade(market.id, {
        side: 'sell',
        outcomeId: outcome.id,
        shares: sharesNum >= (position?.shares ?? 0) - 1e-6 ? position!.shares : sharesNum,
        minAmount: quote ? quote.amount * (1 - SLIPPAGE) : undefined,
      });
    },
    onSuccess: (res) => {
      qc.setQueryData<MarketDetailResponse>(['market', market.id], { market: res.market, positions: res.positions });
      setMe((m) => ({ ...m, balance: res.balance }));
      for (const key of [
        'history',
        'marketTrades',
        'holders',
        'activity',
        'portfolio',
        'markets',
        'stats',
        'leaderboard',
      ]) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
      const t = res.trade;
      toast.success(
        t.side === 'buy'
          ? `买入成功：${formatShares(t.shares)} 份「${t.outcomeLabel}」`
          : `卖出成功：到手 ${formatMoney(t.amount)} ${CURRENCY_NAME}`,
      );
      setAmount('');
      setShares('');
    },
    onError: (err) => {
      toast.error(errorMessage(err));
      void qc.invalidateQueries({ queryKey: ['market', market.id] });
    },
  });

  const balance = me?.balance ?? 0;
  const insufficient = side === 'buy' && amountNum > balance;
  const tooSmall = side === 'buy' && amount !== '' && amountNum < MIN_TRADE_AMOUNT;
  const canSubmit =
    !!me &&
    !!quote &&
    !insufficient &&
    !tooSmall &&
    (side === 'buy' || (position?.shares ?? 0) > 0) &&
    !mutation.isPending;
  const tradable = market.status === 'open';

  const addAmount = (n: number) => setAmount((a) => String(Math.round(((Number(a) || 0) + n) * 100) / 100));

  if (!tradable) return <ClosedPanel market={market} />;

  return (
    <Card className="relative overflow-hidden p-5">
      <div className="relative mb-4 flex items-center gap-1 rounded-xl border border-line bg-white/[0.02] p-1">
        {(['buy', 'sell'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={clsx(
              'flex-1 rounded-lg py-2 text-sm font-semibold transition',
              side === s ? 'bg-white/10 text-fg' : 'text-dim hover:text-fg',
            )}
          >
            {s === 'buy' ? '买入' : '卖出'}
          </button>
        ))}
      </div>

      <div
        className={clsx(
          'relative grid gap-2',
          market.isBinary ? 'grid-cols-2' : 'max-h-64 grid-cols-1 overflow-y-auto pr-1',
        )}
      >
        {market.outcomes.map((o) => {
          const c = outcomeColor(o.index, market.isBinary);
          const selected = o.id === outcome.id;
          return (
            <button
              key={o.id}
              onClick={() => onOutcomeChange(o.id)}
              className={clsx(
                'flex items-center justify-between gap-2 rounded-xl border px-3.5 text-left font-semibold transition-all',
                market.isBinary ? 'h-12' : 'h-10 text-sm',
                selected ? 'text-canvas' : 'border-line bg-white/[0.03] text-fg/85 hover:bg-white/[0.06]',
              )}
              style={
                selected
                  ? { background: c, borderColor: c, boxShadow: `0 0 24px -6px ${c}` }
                  : { borderColor: undefined }
              }
            >
              <span className="flex min-w-0 items-center gap-2">
                {!market.isBinary && !selected && (
                  <span className="size-2 shrink-0 rounded-full" style={{ background: c }} />
                )}
                <span className="truncate">{o.label}</span>
              </span>
              <span className="font-mono text-sm tabular opacity-90">{formatPct(o.probability)}</span>
            </button>
          );
        })}
      </div>

      <>
        <div className="relative mt-5">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium text-dim">{side === 'buy' ? `买入金额（${CURRENCY_NAME}）` : '卖出份额'}</span>
            {me &&
              (side === 'buy' ? (
                <span className="text-faint">
                  余额 <Money value={balance} className="text-dim" />
                </span>
              ) : (
                <span className="text-faint">持有 {formatShares(position?.shares ?? 0)} 份</span>
              ))}
          </div>
          <div className="relative">
            {side === 'buy' && <Drop className="absolute top-1/2 left-3.5 size-5 -translate-y-1/2" />}
            <input
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="0"
              value={side === 'buy' ? amount : shares}
              onChange={(e) => (side === 'buy' ? setAmount(e.target.value) : setShares(e.target.value))}
              className={clsx(
                'h-14 w-full rounded-xl border border-line bg-black/20 pr-4 text-right font-display text-2xl font-semibold tabular outline-none transition',
                'placeholder:text-faint focus:border-brand/60 focus:shadow-[0_0_0_3px_rgb(255_122_26/0.14)]',
                side === 'buy' ? 'pl-11' : 'pl-4',
              )}
            />
          </div>
          <div className="mt-2 flex gap-1.5">
            {side === 'buy'
              ? [
                  ['+10', () => addAmount(10)],
                  ['+50', () => addAmount(50)],
                  ['+100', () => addAmount(100)],
                  ['全部', () => setAmount(String(Math.floor(balance * 100) / 100))],
                ].map(([label, fn]) => (
                  <button
                    key={label as string}
                    onClick={fn as () => void}
                    disabled={!me}
                    className="flex-1 rounded-lg border border-line bg-white/[0.02] py-1.5 text-xs font-medium text-dim transition hover:border-line-strong hover:text-fg disabled:opacity-40"
                  >
                    {label as string}
                  </button>
                ))
              : [0.25, 0.5, 1].map((f) => (
                  <button
                    key={f}
                    disabled={!position}
                    onClick={() =>
                      position &&
                      setShares(String(f === 1 ? position.shares : Math.floor(position.shares * f * 100) / 100))
                    }
                    className="flex-1 rounded-lg border border-line bg-white/[0.02] py-1.5 text-xs font-medium text-dim transition hover:border-line-strong hover:text-fg disabled:opacity-40"
                  >
                    {f === 1 ? '全部' : `${f * 100}%`}
                  </button>
                ))}
          </div>
        </div>

        <div className="relative mt-5 space-y-2 rounded-xl border border-line bg-black/15 p-3.5">
          {side === 'buy' ? (
            <>
              <Row label="平均价格">{quote ? formatPct1(quote.avgPrice) : '—'}</Row>
              <Row label="获得份额">{quote ? formatShares(quote.shares) : '—'}</Row>
              <Row label="概率变化">
                {quote ? (
                  <span className="inline-flex items-center gap-1">
                    {formatPct1(quote.priceBefore)} <ArrowRight className="size-3 text-faint" />
                    <span style={{ color }}>{formatPct1(quote.priceAfter)}</span>
                  </span>
                ) : (
                  '—'
                )}
              </Row>
              <div className="my-1 h-px bg-line" />
              <div className="flex items-end justify-between">
                <span className="text-sm text-faint">猜中可得</span>
                <span className="text-right">
                  <span className="block font-display text-xl font-semibold text-yes">
                    {quote ? <Money value={quote.shares} /> : '—'}
                  </span>
                  {quote && amountNum > 0 && (
                    <span className="text-xs text-yes/80">
                      收益 +{((quote.shares / amountNum - 1) * 100).toFixed(1)}%
                    </span>
                  )}
                </span>
              </div>
            </>
          ) : (
            <>
              <Row label="平均成交价">{quote ? formatPct1(quote.avgPrice) : '—'}</Row>
              <Row label="概率变化">
                {quote ? (
                  <span className="inline-flex items-center gap-1">
                    {formatPct1(quote.priceBefore)} <ArrowRight className="size-3 text-faint" />
                    <span style={{ color }}>{formatPct1(quote.priceAfter)}</span>
                  </span>
                ) : (
                  '—'
                )}
              </Row>
              {quote && position && (
                <Row label="本次盈亏">
                  {(() => {
                    const pnl = quote.amount - (position.cost * Math.min(sharesNum, position.shares)) / position.shares;
                    return (
                      <span className={pnl >= 0 ? 'text-yes' : 'text-no'}>
                        {pnl >= 0 ? '+' : ''}
                        {formatMoney(pnl)}
                      </span>
                    );
                  })()}
                </Row>
              )}
              <div className="my-1 h-px bg-line" />
              <div className="flex items-end justify-between">
                <span className="text-sm text-faint">预计到手</span>
                <span className="font-display text-xl font-semibold">
                  {quote ? <Money value={quote.amount} /> : '—'}
                </span>
              </div>
            </>
          )}
        </div>

        {me ? (
          <Button
            size="lg"
            className="relative mt-4 w-full"
            disabled={!canSubmit}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
            style={
              canSubmit ? { background: color, color: '#05060c', boxShadow: `0 0 24px -10px ${color}` } : undefined
            }
          >
            {insufficient
              ? '余额不足'
              : tooSmall
                ? `最少 ${MIN_TRADE_AMOUNT} ${CURRENCY_NAME}`
                : side === 'sell' && !position
                  ? '没有持仓'
                  : `${side === 'buy' ? '买入' : '卖出'}「${outcome.label}」`}
          </Button>
        ) : (
          <Link
            to={`/login?next=${encodeURIComponent(location.pathname)}`}
            className={buttonClass({ size: 'lg', className: 'relative mt-4 w-full' })}
          >
            <Lock className="size-4" />
            登录后开始交易
          </Link>
        )}
        <p className="relative mt-3 text-center text-[11px] leading-relaxed text-faint">
          每份猜中兑付 1 {CURRENCY_NAME}，猜错归零。价格由自动做市商（LMSR）给出。
        </p>
      </>
    </Card>
  );
}

/** Shown instead of the order form once trading has stopped. */
function ClosedPanel({ market }: { market: MarketDetail }) {
  const winner = market.outcomes.find((o) => o.id === market.resolvedOutcomeId);
  if (market.status === 'resolved' && winner) {
    const c = outcomeColor(winner.index, market.isBinary);
    return (
      <Card className="relative overflow-hidden p-6 text-center">
        <Crown className="relative mx-auto size-8 text-gold" />
        <div className="relative mt-3 text-sm text-dim">最终结果</div>
        <div
          className="relative mt-1 font-display text-3xl font-bold"
          style={{ color: c, textShadow: `0 0 24px ${c}66` }}
        >
          {winner.label}
        </div>
        <p className="relative mt-3 text-xs text-faint">
          持有「{winner.label}」的每份已兑付 1 {CURRENCY_NAME}
        </p>
      </Card>
    );
  }
  return (
    <Card className="flex items-start gap-3 p-5 text-sm text-dim">
      {market.status === 'closed' ? (
        <Hourglass className="mt-0.5 size-5 shrink-0 text-gold" />
      ) : (
        <Ban className="mt-0.5 size-5 shrink-0 text-faint" />
      )}
      <div>
        <div className="font-medium text-fg">{market.status === 'closed' ? '交易已截止' : '市场已取消'}</div>
        <div className="mt-1 text-xs leading-relaxed text-faint">
          {market.status === 'closed'
            ? '等待管理员根据结果结算，结算后奖金自动到账。'
            : `每个人的净投入已退回${CURRENCY_NAME}余额。`}
        </div>
      </div>
    </Card>
  );
}
