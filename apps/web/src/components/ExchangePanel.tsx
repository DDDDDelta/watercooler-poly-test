import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { orderSchema, shareAmountSchema, type BookLevel, type MarketDetail } from '@watercooler/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { api, errorMessage } from '../lib/api';
import { useMe } from '../lib/auth';
import { formatDate, formatMoney } from '../lib/format';
import { Button, Card, Field, Input, Segmented, Spinner } from './ui';

export function ExchangePanel({
  market,
  outcomeId,
  onOutcomeChange,
}: {
  market: MarketDetail;
  outcomeId: number;
  onOutcomeChange: (id: number) => void;
}) {
  const { me } = useMe();
  const qc = useQueryClient();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [price, setPrice] = useState('0.50');
  const [quantity, setQuantity] = useState('10');
  const [postOnly, setPostOnly] = useState(false);
  const [pairs, setPairs] = useState('10');
  const { data, error } = useQuery({
    queryKey: ['exchange', market.id, me?.id],
    queryFn: () => api.exchange(market.id),
    refetchInterval: 3000,
  });
  const action = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: () => {
      toast.success('操作成功');
      void qc.invalidateQueries();
    },
    onError: (err) => {
      toast.error(errorMessage(err));
      void qc.invalidateQueries({ queryKey: ['exchange', market.id] });
    },
  });
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
  const holding = data.positions.find((p) => p.outcomeId === outcomeId);
  const input = { outcomeId, side, price: Number(price), quantity: Number(quantity), postOnly };
  const valid = orderSchema.safeParse(input).success;
  const pairCount = Number(pairs);
  const validPairs = shareAmountSchema.safeParse({ quantity: pairCount }).success;
  const available = (holding?.quantity ?? 0) - (holding?.reserved ?? 0);
  const mergeable = Math.min(
    ...market.outcomes.map((o) => {
      const p = data.positions.find((x) => x.outcomeId === o.id);
      return (p?.quantity ?? 0) - (p?.reserved ?? 0);
    }),
  );
  const open = market.status === 'open';
  const balance = me?.balance ?? 0;
  const label = market.outcomes.find((o) => o.id === outcomeId)!.label;

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
          onClick={() => {
            setSide(isAsk ? 'buy' : 'sell');
            setPrice(r.price.toFixed(2));
          }}
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
          。盘口包含互补订单，点击价格可填单；自己的订单不会与自己成交。
        </p>
        {open ? (
          me ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (valid) action.mutate(() => api.order(market.id, input));
              }}
            >
              <Segmented
                value={side}
                onChange={setSide}
                options={[
                  { value: 'buy', label: '买入' },
                  { value: 'sell', label: '卖出' },
                ]}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field label="限价（每份水滴）">
                  <Input
                    type="number"
                    min="0.01"
                    max="0.99"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                  />
                </Field>
                <Field label="份数（整数）">
                  <Input
                    type="number"
                    min="1"
                    max="1000000"
                    step="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                  />
                </Field>
              </div>
              <p className="text-xs text-dim">
                可用余额 {formatMoney(balance)} · 可卖 {label} {available} 份
              </p>
              <label className="flex items-center gap-2 text-sm text-dim">
                <input
                  type="checkbox"
                  checked={postOnly}
                  onChange={(e) => setPostOnly(e.target.checked)}
                  disabled={action.isPending}
                  className="accent-brand"
                />
                Post-only（只挂单）
              </label>
              {postOnly && (
                <p className="text-xs text-faint">
                  若会立即与其他用户成交，整笔拒绝；包括互补订单。不影响之后别人与你的挂单成交。
                </p>
              )}
              <Button
                type="submit"
                className="w-full"
                loading={action.isPending}
                disabled={
                  !valid ||
                  (side === 'buy' ? input.price * input.quantity > balance + 1e-8 : input.quantity > available)
                }
              >
                {side === 'buy'
                  ? `买入 ${label} · 最多冻结 ${valid ? formatMoney(input.price * input.quantity) : '—'}`
                  : `卖出 ${label}`}
              </Button>
              <p className="text-xs leading-relaxed text-faint">
                限价单按价格、时间优先撮合，可部分成交；未成交部分保留挂单，可随时撤销。无交易手续费。
              </p>
            </form>
          ) : (
            <Link
              to={`/login?next=${encodeURIComponent(`/market/${market.id}`)}`}
              className="block text-center text-brand"
            >
              登录后交易
            </Link>
          )
        ) : (
          <p className="text-sm text-dim">
            {market.status === 'closed'
              ? '交易已截止，等待创建者公布结果；完整的一对份额仍有 1 水滴抵押。'
              : market.status === 'cancelled'
                ? '市场已取消，每份 Yes / No 已自动兑回 0.50 水滴。'
                : '市场已结算，获胜份额已按每份 1 水滴自动兑付。'}
          </p>
        )}
      </Card>
      {me && (
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">我的份额与抵押</h2>
          {market.outcomes.map((o) => {
            const p = data.positions.find((x) => x.outcomeId === o.id);
            return (
              <div key={o.id} className="flex justify-between text-sm">
                <span>{o.label}</span>
                <span className="font-mono">
                  {p?.quantity ?? 0} 份 · 冻结 {p?.reserved ?? 0}
                </span>
              </div>
            );
          })}
          {open && (
            <>
              <Field label="拆分 / 合并份数">
                <Input
                  type="number"
                  min="1"
                  max="1000000"
                  step="1"
                  value={pairs}
                  onChange={(e) => setPairs(e.target.value)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  disabled={!validPairs || pairCount > balance}
                  loading={action.isPending}
                  onClick={() => action.mutate(() => api.splitMerge(market.id, pairCount, 'split'))}
                >
                  抵押生成
                </Button>
                <Button
                  variant="outline"
                  disabled={!validPairs || pairCount > mergeable}
                  loading={action.isPending}
                  onClick={() => action.mutate(() => api.splitMerge(market.id, pairCount, 'merge'))}
                >
                  合并赎回
                </Button>
              </div>
              <p className="text-xs text-faint">
                1 水滴 ⇄ 1 Yes + 1 No。合并只能使用未被冻结的份额；当前可合并 {mergeable} 对。
              </p>
            </>
          )}
          {market.status !== 'open' && market.status !== 'closed' && (
            <p className="text-xs text-faint">以上数量为结算前持仓记录，已兑付，不能再交易。</p>
          )}
        </Card>
      )}
      {me && (
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">我的订单</h2>
          <ul className="max-h-80 divide-y divide-line overflow-y-auto">
            {data.orders.map((o) => (
              <li key={o.id} className="py-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    #{o.id} {o.side === 'buy' ? '买' : '卖'} {market.outcomes.find((x) => x.id === o.outcomeId)?.label}{' '}
                    @ {o.price.toFixed(2)}
                    {o.postOnly && ' · Post-only'}
                  </span>
                  {o.status === 'open' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={action.isPending}
                      onClick={() => action.mutate(() => api.cancelOrder(market.id, o.id))}
                    >
                      撤单
                    </Button>
                  ) : (
                    <span className="text-faint">{o.status === 'filled' ? '全部成交' : '已撤销'}</span>
                  )}
                </div>
                <p className="mt-1 text-faint">
                  已成交 {o.quantity - o.remaining} / {o.quantity} 份{o.status === 'open' && ` · 剩余 ${o.remaining}`}
                </p>
              </li>
            ))}
          </ul>
          {!data.orders.length && <p className="text-xs text-faint">暂无订单</p>}
        </Card>
      )}
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
