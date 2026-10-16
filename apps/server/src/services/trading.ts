import {
  fromCents,
  quoteBuy,
  quoteSell,
  SHARE_EPSILON,
  toCents,
  type Holder,
  type MarketPosition,
  type Trade,
  type TradeInput,
} from '@watercooler/shared';
import type { DB } from '../db';
import { badRequest, conflict, notFound } from '../lib/http';
import {
  derivedStatus,
  getMarketRow,
  getOutcomeRows,
  isTradable,
  marketProbabilities,
  recordPriceSnapshot,
  type MarketRow,
} from './markets';
import { adjustBalance, toUserRef } from './users';

interface PositionRow {
  user_id: number;
  outcome_id: number;
  market_id: number;
  shares: number;
  cost: number;
}

interface TradeRow {
  id: number;
  user_id: number;
  market_id: number;
  outcome_id: number;
  side: 'buy' | 'sell';
  shares: number;
  amount: number;
  price_after: number;
  created_at: number;
  username: string;
  display_name: string;
  question: string;
  label: string;
}

const TRADE_SELECT = `
  SELECT t.*, u.username, u.display_name, m.question, o.label
    FROM trades t
    JOIN users u    ON u.id = t.user_id
    JOIN markets m  ON m.id = t.market_id
    JOIN outcomes o ON o.id = t.outcome_id`;

const toTrade = (r: TradeRow): Trade => ({
  id: r.id,
  user: toUserRef({ id: r.user_id, username: r.username, display_name: r.display_name }),
  marketId: r.market_id,
  marketQuestion: r.question,
  outcomeId: r.outcome_id,
  outcomeLabel: r.label,
  side: r.side,
  shares: r.shares,
  amount: fromCents(r.amount),
  priceAfter: r.price_after,
  createdAt: r.created_at,
});

export function getTrade(db: DB, id: number): Trade {
  return toTrade(db.prepare(`${TRADE_SELECT} WHERE t.id = ?`).get(id) as TradeRow);
}

export function listTrades(
  db: DB,
  opts: { marketId?: number; userId?: number; before?: number; limit?: number },
): Trade[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.marketId !== undefined) {
    where.push('t.market_id = ?');
    params.push(opts.marketId);
  }
  if (opts.userId !== undefined) {
    where.push('t.user_id = ?');
    params.push(opts.userId);
  }
  if (opts.before !== undefined) {
    where.push('t.id < ?');
    params.push(opts.before);
  }
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const rows = db
    .prepare(`${TRADE_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY t.id DESC LIMIT ${limit}`)
    .all(...params) as TradeRow[];
  return rows.map(toTrade);
}

export function getUserPositions(db: DB, userId: number, marketId: number): MarketPosition[] {
  const rows = db
    .prepare('SELECT * FROM positions WHERE user_id = ? AND market_id = ? AND shares > ?')
    .all(userId, marketId, SHARE_EPSILON) as PositionRow[];
  return rows.map((p) => ({ outcomeId: p.outcome_id, shares: p.shares, cost: fromCents(p.cost) }));
}

export function listHolders(db: DB, marketId: number, perOutcome = 10): Holder[] {
  const rows = db
    .prepare(
      `SELECT p.user_id, p.outcome_id, p.shares, u.username, u.display_name
         FROM positions p JOIN users u ON u.id = p.user_id
        WHERE p.market_id = ? AND p.shares > ?
        ORDER BY p.shares DESC`,
    )
    .all(marketId, SHARE_EPSILON) as {
    user_id: number;
    outcome_id: number;
    shares: number;
    username: string;
    display_name: string;
  }[];
  const counts = new Map<number, number>();
  const holders: Holder[] = [];
  for (const r of rows) {
    const n = counts.get(r.outcome_id) ?? 0;
    if (n >= perOutcome) continue;
    counts.set(r.outcome_id, n + 1);
    holders.push({
      user: toUserRef({ id: r.user_id, username: r.username, display_name: r.display_name }),
      outcomeId: r.outcome_id,
      shares: r.shares,
    });
  }
  return holders;
}

/** Execute a buy or sell against the market maker. Returns the new trade id. */
export function executeTrade(db: DB, userId: number, marketId: number, input: TradeInput, now: number): number {
  return db.transaction(() => {
    const market = getMarketRow(db, marketId);
    if (!isTradable(market, now)) throw conflict('该市场已停止交易');
    const outcomes = getOutcomeRows(db, marketId);
    const i = outcomes.findIndex((o) => o.id === input.outcomeId);
    const outcome = outcomes[i];
    if (!outcome) throw notFound('选项不存在');
    const q = outcomes.map((o) => o.shares);
    const b = market.liquidity;

    let shares: number;
    let amountCents: number;
    let priceBefore: number;
    let pricesAfter: number[];

    if (input.side === 'buy') {
      amountCents = toCents(input.amount);
      const quote = quoteBuy(q, b, i, fromCents(amountCents));
      if (input.minShares !== undefined && quote.shares < input.minShares - 1e-9) {
        throw conflict('价格已变动，请确认新的报价后重试');
      }
      shares = quote.shares;
      priceBefore = quote.priceBefore;
      pricesAfter = quote.pricesAfter;
      adjustBalance(db, userId, -amountCents, 'buy', now, { marketId });
      db.prepare(
        `INSERT INTO positions (user_id, outcome_id, market_id, shares, cost) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id, outcome_id) DO UPDATE SET shares = shares + excluded.shares, cost = cost + excluded.cost`,
      ).run(userId, outcome.id, marketId, shares, amountCents);
      db.prepare('UPDATE outcomes SET shares = ? WHERE id = ?').run(outcome.shares + shares, outcome.id);
    } else {
      const pos = db.prepare('SELECT * FROM positions WHERE user_id = ? AND outcome_id = ?').get(userId, outcome.id) as
        PositionRow | undefined;
      if (!pos || pos.shares <= SHARE_EPSILON) throw badRequest('你没有这个选项的持仓');
      if (input.shares > pos.shares + SHARE_EPSILON) throw badRequest('卖出份额超过持仓');
      const sellAll = input.shares >= pos.shares - SHARE_EPSILON;
      shares = sellAll ? pos.shares : input.shares;
      const quote = quoteSell(q, b, i, shares);
      amountCents = Math.floor(quote.amount * 100 + 1e-7);
      if (amountCents <= 0) throw badRequest('卖出金额太小');
      if (input.minAmount !== undefined && fromCents(amountCents) < input.minAmount - 1e-9) {
        throw conflict('价格已变动，请确认新的报价后重试');
      }
      priceBefore = quote.priceBefore;
      pricesAfter = quote.pricesAfter;
      const costRemoved = sellAll ? pos.cost : Math.round((pos.cost * shares) / pos.shares);
      db.prepare('UPDATE positions SET shares = ?, cost = ? WHERE user_id = ? AND outcome_id = ?').run(
        sellAll ? 0 : pos.shares - shares,
        pos.cost - costRemoved,
        userId,
        outcome.id,
      );
      db.prepare('UPDATE outcomes SET shares = ? WHERE id = ?').run(outcome.shares - shares, outcome.id);
      adjustBalance(db, userId, amountCents, 'sell', now, { marketId });
    }

    db.prepare('UPDATE markets SET volume = volume + ? WHERE id = ?').run(amountCents, marketId);
    recordPriceSnapshot(db, marketId, pricesAfter, now);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO trades (user_id, market_id, outcome_id, side, shares, amount, price_before, price_after, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(userId, marketId, outcome.id, input.side, shares, amountCents, priceBefore, pricesAfter[i]!, now);
    return Number(lastInsertRowid);
  })();
}

function assertResolvable(market: MarketRow, now: number): void {
  const status = derivedStatus(market, now);
  if (status === 'resolved') throw conflict('该市场已结算');
  if (status === 'cancelled') throw conflict('该市场已取消');
}

/** Pay 1 unit per winning share and close the market for good. */
export function resolveMarket(
  db: DB,
  marketId: number,
  outcomeId: number,
  resolverId: number,
  note: string | undefined,
  now: number,
): void {
  db.transaction(() => {
    const market = getMarketRow(db, marketId);
    assertResolvable(market, now);
    const outcomes = getOutcomeRows(db, marketId);
    if (!outcomes.some((o) => o.id === outcomeId)) throw notFound('选项不存在');

    const winners = db
      .prepare('SELECT user_id, shares FROM positions WHERE outcome_id = ? AND shares > ?')
      .all(outcomeId, SHARE_EPSILON) as { user_id: number; shares: number }[];
    for (const w of winners) {
      const payout = Math.round(w.shares * 100);
      if (payout > 0) adjustBalance(db, w.user_id, payout, 'payout', now, { marketId });
    }
    db.prepare(
      `UPDATE markets SET status = 'resolved', resolved_outcome_id = ?, resolved_at = ?, resolved_by = ?,
              resolution_note = ?, close_at = MIN(close_at, ?) WHERE id = ?`,
    ).run(outcomeId, now, resolverId, note || null, now, marketId);
    recordPriceSnapshot(
      db,
      marketId,
      marketProbabilities(
        { status: 'resolved', resolved_outcome_id: outcomeId, liquidity: market.liquidity },
        outcomes,
      ),
      now,
    );
  })();
}

/** Void the market: everyone gets back what they put in, net of what they already took out. */
export function cancelMarket(
  db: DB,
  marketId: number,
  resolverId: number,
  note: string | undefined,
  now: number,
): void {
  db.transaction(() => {
    const market = getMarketRow(db, marketId);
    assertResolvable(market, now);
    const nets = db
      .prepare(
        `SELECT user_id, SUM(CASE side WHEN 'buy' THEN amount ELSE -amount END) AS net
           FROM trades WHERE market_id = ? GROUP BY user_id`,
      )
      .all(marketId) as { user_id: number; net: number }[];
    for (const { user_id, net } of nets) {
      if (net > 0) adjustBalance(db, user_id, net, 'refund', now, { marketId, note: '市场取消退款' });
    }
    db.prepare(
      `UPDATE markets SET status = 'cancelled', resolved_at = ?, resolved_by = ?, resolution_note = ?,
              close_at = MIN(close_at, ?) WHERE id = ?`,
    ).run(now, resolverId, note || null, now, marketId);
  })();
}
