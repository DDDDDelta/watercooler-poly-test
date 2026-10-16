import {
  cancelMarketSchema,
  commentSchema,
  createMarketSchema,
  fromCents,
  resolveMarketSchema,
  tradeSchema,
  type MarketDetailResponse,
  type TradeResult,
} from '@watercooler/shared';
import { Hono } from 'hono';
import { requireAdmin, requireUser, type AppDeps, type AppEnv } from '../context';
import { forbidden, parseBody, parseId } from '../lib/http';
import { addComment, deleteComment, listComments } from '../services/comments';
import {
  createMarket,
  getMarketDetail,
  getMarketRow,
  getPriceHistory,
  listMarkets,
  type HistoryRange,
  type MarketFilter,
  type MarketSort,
} from '../services/markets';
import {
  cancelMarket,
  executeTrade,
  getTrade,
  getUserPositions,
  listHolders,
  listTrades,
  resolveMarket,
} from '../services/trading';
import { getUserById } from '../services/users';

const pick = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

export function marketRoutes({ db, config, now }: AppDeps) {
  const app = new Hono<AppEnv>();

  app.get('/markets', (c) => {
    const q = c.req.query();
    return c.json(
      listMarkets(db, now(), {
        filter: pick<MarketFilter>(q.filter, ['active', 'closed', 'resolved', 'all'], 'active'),
        sort: pick<MarketSort>(q.sort, ['trending', 'volume', 'new', 'closing'], 'trending'),
        category: q.category || undefined,
        search: q.q?.trim() || undefined,
        creatorId: q.creator ? Number(q.creator) : undefined,
        limit: q.limit ? Number(q.limit) : undefined,
      }),
    );
  });

  app.post('/markets', async (c) => {
    const user = requireUser(c);
    if (!config.allowUserMarkets && user.role !== 'admin') throw forbidden('只有管理员可以创建市场');
    const input = await parseBody(c, createMarketSchema);
    const id = createMarket(db, user.id, input, now());
    return c.json({ id }, 201);
  });

  app.get('/markets/:id', (c) => {
    const id = parseId(c.req.param('id'));
    const user = c.get('user');
    return c.json<MarketDetailResponse>({
      market: getMarketDetail(db, id, now()),
      positions: user ? getUserPositions(db, user.id, id) : [],
    });
  });

  app.get('/markets/:id/history', (c) => {
    const id = parseId(c.req.param('id'));
    const range = pick<HistoryRange>(c.req.query('range'), ['1d', '1w', '1m', 'all'], 'all');
    return c.json(getPriceHistory(db, id, range, now()));
  });

  app.get('/markets/:id/trades', (c) => {
    const id = parseId(c.req.param('id'));
    const before = c.req.query('before');
    return c.json(listTrades(db, { marketId: id, before: before ? Number(before) : undefined, limit: 50 }));
  });

  app.get('/markets/:id/holders', (c) => {
    const id = parseId(c.req.param('id'));
    getMarketRow(db, id);
    return c.json(listHolders(db, id));
  });

  app.post('/markets/:id/trade', async (c) => {
    const user = requireUser(c);
    const id = parseId(c.req.param('id'));
    const input = await parseBody(c, tradeSchema);
    const t = now();
    const tradeId = executeTrade(db, user.id, id, input, t);
    return c.json<TradeResult>({
      trade: getTrade(db, tradeId),
      balance: fromCents(getUserById(db, user.id)!.balance),
      market: getMarketDetail(db, id, t),
      positions: getUserPositions(db, user.id, id),
    });
  });

  app.post('/markets/:id/resolve', async (c) => {
    const admin = requireAdmin(c);
    const id = parseId(c.req.param('id'));
    const input = await parseBody(c, resolveMarketSchema);
    const t = now();
    resolveMarket(db, id, input.outcomeId, admin.id, input.note, t);
    return c.json(getMarketDetail(db, id, t));
  });

  app.post('/markets/:id/cancel', async (c) => {
    const admin = requireAdmin(c);
    const id = parseId(c.req.param('id'));
    const input = await parseBody(c, cancelMarketSchema);
    const t = now();
    cancelMarket(db, id, admin.id, input.note, t);
    return c.json(getMarketDetail(db, id, t));
  });

  app.get('/markets/:id/comments', (c) => {
    const id = parseId(c.req.param('id'));
    return c.json(listComments(db, id));
  });

  app.post('/markets/:id/comments', async (c) => {
    const user = requireUser(c);
    const id = parseId(c.req.param('id'));
    getMarketRow(db, id);
    const input = await parseBody(c, commentSchema);
    return c.json(addComment(db, id, user.id, input.body, now()), 201);
  });

  app.delete('/comments/:id', (c) => {
    const user = requireUser(c);
    deleteComment(db, parseId(c.req.param('id')), user);
    return c.json({ ok: true });
  });

  return app;
}
