import {
  fromCents,
  grantSchema,
  resetPasswordSchema,
  setRoleSchema,
  toCents,
  type AdminUser,
  type Portfolio,
  type UserProfile,
} from '@watercooler/shared';
import { Hono } from 'hono';
import { requireAdmin, requireUser, type AppDeps, type AppEnv } from '../context';
import { badRequest, notFound, parseBody, parseId } from '../lib/http';
import { hashPassword } from '../lib/password';
import { revokeSessions } from '../lib/session';
import { listMarkets } from '../services/markets';
import {
  computeAllStats,
  leaderboard,
  siteStats,
  userLedger,
  userPositions,
  userStatsAndRank,
  type LeaderboardSort,
} from '../services/stats';
import { listTrades } from '../services/trading';
import { adjustBalance, getUserById, toPublicUser, type UserRow } from '../services/users';

export function userRoutes({ db, now }: AppDeps) {
  const app = new Hono<AppEnv>();

  app.get('/stats', (c) => c.json(siteStats(db, now())));

  app.get('/activity', (c) => c.json(listTrades(db, { limit: Number(c.req.query('limit')) || 30 })));

  app.get('/leaderboard', (c) => {
    const sort = c.req.query('sort');
    return c.json(leaderboard(db, sort === 'netWorth' || sort === 'volume' ? (sort as LeaderboardSort) : 'profit'));
  });

  app.get('/portfolio', (c) => {
    const user = requireUser(c);
    return c.json<Portfolio>({
      stats: userStatsAndRank(db, user.id).stats,
      positions: userPositions(db, user.id, now()),
    });
  });

  app.get('/portfolio/ledger', (c) => {
    const user = requireUser(c);
    const before = c.req.query('before');
    return c.json(userLedger(db, user.id, { before: before ? Number(before) : undefined }));
  });

  app.get('/users/:id', (c) => {
    const id = parseId(c.req.param('id'));
    const user = getUserById(db, id);
    if (!user) throw notFound('用户不存在');
    const t = now();
    const { stats, rank } = userStatsAndRank(db, id);
    return c.json<UserProfile>({
      user: toPublicUser(user),
      stats,
      rank,
      positions: userPositions(db, id, t),
      trades: listTrades(db, { userId: id, limit: 30 }),
      createdMarkets: listMarkets(db, t, { filter: 'all', sort: 'new', creatorId: id, limit: 50 }),
    });
  });

  // ---- admin ----

  app.get('/admin/users', (c) => {
    requireAdmin(c);
    const stats = computeAllStats(db);
    const rows = db.prepare('SELECT * FROM users ORDER BY id').all() as UserRow[];
    return c.json<AdminUser[]>(
      rows.map((u) => ({
        ...toPublicUser(u),
        balance: fromCents(u.balance),
        netWorth: stats.get(u.id)?.netWorth ?? 0,
        tradeCount: stats.get(u.id)?.tradeCount ?? 0,
      })),
    );
  });

  app.post('/admin/users/:id/grant', async (c) => {
    requireAdmin(c);
    const id = parseId(c.req.param('id'));
    if (!getUserById(db, id)) throw notFound('用户不存在');
    const input = await parseBody(c, grantSchema);
    const balance = db.transaction(() =>
      adjustBalance(db, id, toCents(input.amount), 'grant', now(), { note: input.note || '管理员调整' }),
    )();
    return c.json({ balance: fromCents(balance) });
  });

  app.post('/admin/users/:id/role', async (c) => {
    const admin = requireAdmin(c);
    const id = parseId(c.req.param('id'));
    const input = await parseBody(c, setRoleSchema);
    if (id === admin.id && input.role !== 'admin') throw badRequest('不能取消自己的管理员权限');
    const res = db.prepare('UPDATE users SET role = ? WHERE id = ?').run(input.role, id);
    if (res.changes === 0) throw notFound('用户不存在');
    return c.json({ ok: true });
  });

  app.post('/admin/users/:id/password', async (c) => {
    requireAdmin(c);
    const id = parseId(c.req.param('id'));
    const input = await parseBody(c, resetPasswordSchema);
    const res = db
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(await hashPassword(input.newPassword), id);
    if (res.changes === 0) throw notFound('用户不存在');
    revokeSessions(null, db, id, false);
    return c.json({ ok: true });
  });

  return app;
}
