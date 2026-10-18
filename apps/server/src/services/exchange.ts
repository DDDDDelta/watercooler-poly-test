import {
  fromCents,
  orderSchema,
  shareAmountSchema,
  type BookLevel,
  type ExchangeOrder,
  type ExchangePortfolioPosition,
  type ExchangePortfolioOrder,
  type ExchangeState,
  type OrderInput,
} from '@watercooler/shared';
import type { DB } from '../db';
import { badRequest, conflict, forbidden, notFound } from '../lib/http';
import { derivedStatus, getMarketRow, getOutcomeRows, isBettable, recordPriceSnapshot } from './markets';
import { adjustBalance } from './users';

export interface OrderRow {
  post_only: number;
  client_order_id: string | null;
  id: number;
  user_id: number;
  market_id: number;
  outcome_id: number;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  remaining: number;
  status: 'open' | 'filled' | 'cancelled';
  created_at: number;
}

function exchangeMarket(db: DB, marketId: number, now?: number) {
  const m = getMarketRow(db, marketId);
  if (m.mode !== 'polymarket') throw badRequest('此市场不是 Polymarket 模式');
  if (now !== undefined && !isBettable(m, now)) throw conflict('交易已截止');
  return m;
}

function position(db: DB, userId: number, marketId: number, outcomeId: number, quantity: number, reserved = 0) {
  db.prepare(
    `INSERT INTO exchange_positions (user_id, market_id, outcome_id) VALUES (?, ?, ?)
    ON CONFLICT(user_id, outcome_id) DO NOTHING`,
  ).run(userId, marketId, outcomeId);
  db.prepare(
    'UPDATE exchange_positions SET quantity = quantity + ?, reserved = reserved + ? WHERE user_id = ? AND outcome_id = ?',
  ).run(quantity, reserved, userId, outcomeId);
}

function available(db: DB, userId: number, outcomeId: number): number {
  return (
    (
      db
        .prepare('SELECT quantity - reserved AS n FROM exchange_positions WHERE user_id = ? AND outcome_id = ?')
        .get(userId, outcomeId) as { n: number } | undefined
    )?.n ?? 0
  );
}

export function splitMerge(
  db: DB,
  userId: number,
  marketId: number,
  quantity: number,
  action: 'split' | 'merge',
  now: number,
) {
  if (!shareAmountSchema.safeParse({ quantity }).success) throw badRequest('份额必须为 1–1000000 的整数');
  db.transaction(() => {
    exchangeMarket(db, marketId, now);
    const outcomes = getOutcomeRows(db, marketId);
    if (action === 'merge' && outcomes.some((o) => available(db, userId, o.id) < quantity))
      throw badRequest('可用 Yes / No 份额不足');
    const delta = action === 'split' ? quantity : -quantity;
    adjustBalance(db, userId, -delta * 100, action, now, { marketId });
    for (const o of outcomes) position(db, userId, marketId, o.id, delta);
    db.prepare('UPDATE markets SET pot = pot + ? WHERE id = ?').run(delta * 100, marketId);
  })();
}

export const toOrder = (o: OrderRow): ExchangeOrder => ({
  postOnly: o.post_only === 1,
  clientOrderId: o.client_order_id,
  id: o.id,
  outcomeId: o.outcome_id,
  side: o.side,
  price: fromCents(o.price),
  quantity: o.quantity,
  remaining: o.remaining,
  status: o.status,
  createdAt: o.created_at,
});

function releaseOrder(db: DB, o: OrderRow, now: number) {
  if (o.side === 'buy') {
    adjustBalance(db, o.user_id, o.price * o.remaining, 'order_release', now, {
      marketId: o.market_id,
      note: `撤销订单 #${o.id}`,
    });
  } else {
    position(db, o.user_id, o.market_id, o.outcome_id, 0, -o.remaining);
  }
  db.prepare("UPDATE exchange_orders SET status = 'cancelled' WHERE id = ?").run(o.id);
}

// Both direct orders and complementary orders contribute executable liquidity.
function levels(db: DB, marketId: number, outcomeId: number, side: 'buy' | 'sell'): BookLevel[] {
  const rows = db
    .prepare(
      `SELECT CASE WHEN outcome_id = @outcome THEN price ELSE 100-price END AS price, SUM(remaining) AS quantity
    FROM exchange_orders WHERE market_id = @market AND status = 'open' AND
    ((outcome_id = @outcome AND side = @side) OR (outcome_id <> @outcome AND side <> @side))
    GROUP BY CASE WHEN outcome_id = @outcome THEN price ELSE 100-price END
    ORDER BY price ${side === 'buy' ? 'DESC' : 'ASC'}`,
    )
    .all({ market: marketId, outcome: outcomeId, side }) as { price: number; quantity: number }[];
  return rows.map((r) => ({ price: fromCents(r.price), quantity: r.quantity }));
}

function refreshPrices(db: DB, marketId: number, now: number) {
  const probs = getOutcomeRows(db, marketId).map((o) => {
    const bid = levels(db, marketId, o.id, 'buy')[0]?.price;
    const ask = levels(db, marketId, o.id, 'sell')[0]?.price;
    const price =
      bid !== undefined && ask !== undefined && ask - bid <= 0.10000001
        ? (bid + ask) / 2
        : fromCents(o.last_price ?? 50);
    db.prepare('UPDATE outcomes SET mark_price = ? WHERE id = ?').run(price * 100, o.id);
    return price;
  });
  recordPriceSnapshot(db, marketId, probs, now);
}

function fillLeg(db: DB, o: OrderRow, quantity: number, price: number, now: number) {
  if (o.side === 'buy') {
    if (price > o.price) throw new Error('Fill exceeds buy limit');
    const improvement = (o.price - price) * quantity;
    if (improvement)
      adjustBalance(db, o.user_id, improvement, 'order_release', now, { marketId: o.market_id, note: '成交价格改善' });
    position(db, o.user_id, o.market_id, o.outcome_id, quantity);
  } else {
    if (price < o.price) throw new Error('Fill below sell limit');
    position(db, o.user_id, o.market_id, o.outcome_id, -quantity, -quantity);
    adjustBalance(db, o.user_id, price * quantity, 'sell', now, { marketId: o.market_id });
  }
  db.prepare(
    `UPDATE exchange_orders SET remaining = remaining - ?,
    status = CASE WHEN remaining = ? THEN 'filled' ELSE 'open' END WHERE id = ?`,
  ).run(quantity, quantity, o.id);
  o.remaining -= quantity;
}

/** Price first, then resting order id (FIFO). Each fill executes at the maker's price. */
export function placeOrder(db: DB, userId: number, marketId: number, input: OrderInput, now: number): ExchangeOrder {
  if (!orderSchema.safeParse(input).success) throw badRequest('订单价格或份额无效');
  return db.transaction(() => {
    // Check before reserving assets or checking close time: retries return the original order,
    // including its latest fills/cancellation, even after the market has closed.
    if (input.clientOrderId) {
      const existing = db
        .prepare('SELECT * FROM exchange_orders WHERE user_id = ? AND client_order_id = ?')
        .get(userId, input.clientOrderId) as OrderRow | undefined;
      if (existing) {
        if (
          existing.market_id !== marketId ||
          existing.outcome_id !== input.outcomeId ||
          existing.side !== input.side ||
          existing.price !== Math.round(input.price * 100) ||
          existing.quantity !== input.quantity ||
          existing.post_only !== Number(input.postOnly ?? false)
        )
          throw conflict('clientOrderId 已用于不同的订单');
        return toOrder(existing);
      }
    }
    exchangeMarket(db, marketId, now);
    if (!getOutcomeRows(db, marketId).some((o) => o.id === input.outcomeId)) throw notFound('选项不存在');
    const price = Math.round(input.price * 100);
    if (input.side === 'buy') {
      adjustBalance(db, userId, price * -input.quantity, 'order_lock', now, { marketId });
    } else {
      if (available(db, userId, input.outcomeId) < input.quantity) throw badRequest('可用份额不足，不能裸卖空');
      position(db, userId, marketId, input.outcomeId, 0, input.quantity);
    }
    const id = Number(
      db
        .prepare(
          `INSERT INTO exchange_orders (user_id, market_id, outcome_id, side, price, quantity, remaining, created_at, client_order_id, post_only)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          userId,
          marketId,
          input.outcomeId,
          input.side,
          price,
          input.quantity,
          input.quantity,
          now,
          input.clientOrderId ?? null,
          Number(input.postOnly ?? false),
        ).lastInsertRowid,
    );
    const incoming = db.prepare('SELECT * FROM exchange_orders WHERE id = ?').get(id) as OrderRow;
    while (incoming.remaining > 0) {
      const maker = db
        .prepare(
          `SELECT *, CASE WHEN outcome_id = @outcome THEN price ELSE 100-price END AS effective_price
        FROM exchange_orders WHERE market_id = @market AND status = 'open' AND user_id <> @user AND
        ((outcome_id = @outcome AND side <> @side) OR (outcome_id <> @outcome AND side = @side))
        AND (CASE WHEN outcome_id = @outcome THEN price ELSE 100-price END) ${input.side === 'buy' ? '<=' : '>='} @price
        ORDER BY effective_price ${input.side === 'buy' ? 'ASC' : 'DESC'}, id ASC LIMIT 1`,
        )
        .get({ market: marketId, user: userId, outcome: input.outcomeId, side: input.side, price }) as
        OrderRow | undefined;
      if (!maker) break;
      // Reject before the first fill; the transaction rolls back reservations and insertion.
      // The ordinary candidate query also covers complementary liquidity and excludes self-trades.
      if (input.postOnly) throw conflict('Post-only 订单会立即成交，已拒绝，请调整限价');
      const quantity = Math.min(incoming.remaining, maker.remaining);
      const fillPrice = maker.outcome_id === input.outcomeId ? maker.price : 100 - maker.price;
      const kind = maker.side !== incoming.side ? 'transfer' : incoming.side === 'buy' ? 'mint' : 'merge';
      fillLeg(db, maker, quantity, maker.price, now);
      fillLeg(db, incoming, quantity, fillPrice, now);
      if (kind !== 'transfer')
        db.prepare('UPDATE markets SET pot = pot + ? WHERE id = ?').run(
          (kind === 'mint' ? 100 : -100) * quantity,
          marketId,
        );
      db.prepare(
        `INSERT INTO exchange_trades (market_id, outcome_id, maker_id, taker_id, price, quantity, kind, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(marketId, input.outcomeId, maker.id, id, fillPrice, quantity, kind, now);
      // Every trade implies the complementary token's price as well.
      db.prepare('UPDATE outcomes SET last_price = CASE WHEN id = ? THEN ? ELSE ? END WHERE market_id = ?').run(
        input.outcomeId,
        fillPrice,
        100 - fillPrice,
        marketId,
      );
    }
    refreshPrices(db, marketId, now);
    return toOrder(db.prepare('SELECT * FROM exchange_orders WHERE id = ?').get(id) as OrderRow);
  })();
}

export function cancelOrder(db: DB, userId: number, marketId: number, orderId: number, now: number) {
  db.transaction(() => {
    exchangeMarket(db, marketId);
    const o = db.prepare('SELECT * FROM exchange_orders WHERE id = ? AND market_id = ?').get(orderId, marketId) as
      OrderRow | undefined;
    if (!o) throw notFound('订单不存在');
    if (o.user_id !== userId) throw forbidden('只能撤销自己的订单');
    if (o.status !== 'open') throw conflict('订单已成交或已撤销');
    releaseOrder(db, o, now);
    refreshPrices(db, marketId, now);
  })();
}

/** Release all open-order collateral at close, even before the result is announced. */
export function expireExchangeOrders(db: DB, now: number) {
  db.transaction(() => {
    const orders = db
      .prepare(
        `SELECT o.* FROM exchange_orders o JOIN markets m ON m.id = o.market_id
      WHERE o.status = 'open' AND (m.status <> 'open' OR m.close_at <= ?)`,
      )
      .all(now) as OrderRow[];
    for (const o of orders) releaseOrder(db, o, now);
    for (const id of new Set(orders.map((o) => o.market_id))) refreshPrices(db, id, now);
  })();
}

/** Caller wraps this together with the market status change in one transaction. */
export function settleExchange(db: DB, marketId: number, winner: number | null, now: number) {
  const orders = db
    .prepare("SELECT * FROM exchange_orders WHERE market_id = ? AND status = 'open'")
    .all(marketId) as OrderRow[];
  for (const o of orders) releaseOrder(db, o, now);
  const payouts = db
    .prepare(
      `SELECT user_id, SUM(quantity * CASE WHEN @winner IS NULL THEN 50 WHEN outcome_id = @winner THEN 100 ELSE 0 END) AS amount
    FROM exchange_positions WHERE market_id = @market GROUP BY user_id`,
    )
    .all({ winner, market: marketId }) as { user_id: number; amount: number }[];
  const collateral = getMarketRow(db, marketId).pot;
  if (payouts.reduce((n, p) => n + p.amount, 0) !== collateral)
    throw new Error('Exchange collateral invariant violated');
  for (const p of payouts)
    if (p.amount)
      adjustBalance(db, p.user_id, p.amount, winner === null ? 'refund' : 'payout', now, {
        marketId,
        note: winner === null ? '市场取消，每份 Yes / No 兑回 0.50' : '获胜份额每份兑回 1',
      });
  db.prepare('UPDATE markets SET pot = 0 WHERE id = ?').run(marketId);
  db.prepare(
    'UPDATE outcomes SET mark_price = CASE WHEN ? IS NULL THEN 50 WHEN id = ? THEN 100 ELSE 0 END WHERE market_id = ?',
  ).run(winner, winner, marketId);
}

export function exchangeState(db: DB, marketId: number, userId?: number): ExchangeState {
  const m = exchangeMarket(db, marketId);
  const outcomes = getOutcomeRows(db, marketId);
  const trades = db
    .prepare('SELECT * FROM exchange_trades WHERE market_id = ? ORDER BY id DESC LIMIT 50')
    .all(marketId) as {
    id: number;
    outcome_id: number;
    price: number;
    quantity: number;
    kind: 'transfer' | 'mint' | 'merge';
    created_at: number;
  }[];
  return {
    collateral: fromCents(m.pot),
    books: outcomes.map((o) => ({
      outcomeId: o.id,
      bids: levels(db, marketId, o.id, 'buy'),
      asks: levels(db, marketId, o.id, 'sell'),
      lastPrice: o.last_price === null ? null : fromCents(o.last_price),
    })),
    positions: userId
      ? (db
          .prepare(
            'SELECT outcome_id AS outcomeId, quantity, reserved FROM exchange_positions WHERE market_id = ? AND user_id = ?',
          )
          .all(marketId, userId) as ExchangeState['positions'])
      : [],
    orders: userId
      ? (
          db
            .prepare(
              `SELECT * FROM exchange_orders WHERE market_id = ? AND user_id = ? AND
              (status = 'open' OR id IN (SELECT id FROM exchange_orders WHERE market_id = ? AND user_id = ? ORDER BY id DESC LIMIT 100))
              ORDER BY (status = 'open') DESC, id DESC`,
            )
            .all(marketId, userId, marketId, userId) as OrderRow[]
        ).map(toOrder)
      : [],
    trades: trades.map((t) => ({
      id: t.id,
      outcomeId: t.outcome_id,
      price: fromCents(t.price),
      quantity: t.quantity,
      kind: t.kind,
      createdAt: t.created_at,
    })),
  };
}

export function exchangePortfolio(db: DB, userId: number, now: number): ExchangePortfolioPosition[] {
  const rows = db
    .prepare(
      `SELECT p.*, m.question, m.status, m.close_at, o.label, o.mark_price
    FROM exchange_positions p JOIN markets m ON m.id = p.market_id JOIN outcomes o ON o.id = p.outcome_id
    WHERE p.user_id = ? AND p.quantity > 0 ORDER BY (m.status = 'open') DESC, m.id DESC`,
    )
    .all(userId) as {
    market_id: number;
    outcome_id: number;
    quantity: number;
    reserved: number;
    question: string;
    status: 'open' | 'resolved' | 'cancelled';
    close_at: number;
    label: string;
    mark_price: number;
  }[];
  return rows.map((r) => ({
    marketId: r.market_id,
    outcomeId: r.outcome_id,
    quantity: r.quantity,
    reserved: r.reserved,
    question: r.question,
    outcomeLabel: r.label,
    status: derivedStatus(r, now),
    price: fromCents(r.mark_price),
  }));
}

export function exchangePortfolioOrders(db: DB, userId: number): ExchangePortfolioOrder[] {
  const rows = db
    .prepare(
      `SELECT e.*, m.question, o.label FROM exchange_orders e
    JOIN markets m ON m.id = e.market_id JOIN outcomes o ON o.id = e.outcome_id
    WHERE e.user_id = ? AND e.status = 'open' ORDER BY e.id DESC`,
    )
    .all(userId) as (OrderRow & { question: string; label: string })[];
  return rows.map((r) => ({ ...toOrder(r), marketId: r.market_id, question: r.question, outcomeLabel: r.label }));
}
