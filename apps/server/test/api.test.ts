import { describe, expect, it } from 'vitest';
import { normalizeBasePath } from '../src/config';
import { setup } from './helpers';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function makeMarket(
  env: ReturnType<typeof setup>,
  c: Awaited<ReturnType<ReturnType<typeof setup>['register']>>,
  outcomes = ['是', '否'],
) {
  const res = await c.post('/markets', {
    question: '周五团建会下雨吗？',
    description: '以气象局为准',
    category: '生活',
    closeAt: env.clock.now + 2 * DAY,
    outcomes,
  });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

describe('auth', () => {
  it('registers, makes the first user admin, logs in and out', async () => {
    const env = setup();
    const alice = await env.register('alice');
    const me = await alice.get('/auth/me');
    expect(me.body.user).toMatchObject({ username: 'alice', role: 'admin', balance: 1000, canClaimBonus: true });

    const bob = await env.register('bob');
    expect((await bob.get('/auth/me')).body.user.role).toBe('user');

    expect((await bob.post('/auth/logout')).status).toBe(200);
    expect((await bob.get('/auth/me')).body.user).toBeNull();

    const bad = await bob.post('/auth/login', { username: 'bob', password: 'wrong' });
    expect(bad.status).toBe(401);
    const good = await bob.post('/auth/login', { username: 'BOB', password: 'secret123' });
    expect(good.status).toBe(200);
    expect((await bob.get('/auth/me')).body.user.username).toBe('bob');
  });

  it('rejects duplicate usernames case-insensitively and enforces invite codes', async () => {
    const env = setup({ inviteCode: 'water' });
    const c = env.client();
    expect(
      (await c.post('/auth/register', { username: 'amy', displayName: 'Amy', password: 'secret123' })).status,
    ).toBe(403);
    expect(
      (
        await c.post('/auth/register', {
          username: 'amy',
          displayName: 'Amy',
          password: 'secret123',
          inviteCode: 'water',
        })
      ).status,
    ).toBe(201);
    const dup = await env
      .client()
      .post('/auth/register', { username: 'AMY', displayName: 'Amy2', password: 'secret123', inviteCode: 'water' });
    expect(dup.status).toBe(409);
  });

  it('requires JSON for mutations (CSRF guard) and auth for trading', async () => {
    const env = setup();
    const res = await env.app.request('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'a=b',
    });
    expect(res.status).toBe(415);
    const anon = env.client();
    expect((await anon.post('/markets/1/trade', { side: 'buy', outcomeId: 1, amount: 10 })).status).toBe(401);
  });

  it('private mode hides everything from anonymous visitors', async () => {
    const env = setup({ privateMode: true });
    const anon = env.client();
    expect((await anon.get('/markets')).status).toBe(401);
    expect((await anon.get('/leaderboard')).status).toBe(401);
    expect((await anon.get('/config')).body.privateMode).toBe(true);
    expect((await anon.get('/auth/me')).body.user).toBeNull();
    const alice = await env.register('alice');
    expect((await alice.get('/markets')).status).toBe(200);
  });

  it('scopes the session cookie to BASE_PATH', async () => {
    const register = (env: ReturnType<typeof setup>) =>
      env.app.request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'amy', displayName: 'Amy', password: 'secret123' }),
      });
    const sub = await register(setup({ basePath: normalizeBasePath('/watercooler/') }));
    expect(sub.headers.get('set-cookie')).toContain('Path=/watercooler;');
    const root = await register(setup());
    expect(root.headers.get('set-cookie')).toContain('Path=/;');
  });

  it('daily bonus can be claimed once per day', async () => {
    const env = setup();
    const c = await env.register('alice');
    expect((await c.post('/me/bonus')).body.balance).toBe(1100);
    expect((await c.post('/me/bonus')).status).toBe(409);
    env.clock.now += DAY;
    expect((await c.post('/me/bonus')).body.balance).toBe(1200);
  });
});

describe('trading', () => {
  it('buys and sells against the market maker and updates prices', async () => {
    const env = setup();
    const admin = await env.register('admin');
    const bob = await env.register('bob');
    const id = await makeMarket(env, admin);

    const detail = (await bob.get(`/markets/${id}`)).body;
    expect(detail.market.outcomes.map((o: any) => o.probability)).toEqual([0.5, 0.5]);
    const yes = detail.market.outcomes[0].id;

    const buy = await bob.post(`/markets/${id}/trade`, { side: 'buy', outcomeId: yes, amount: 100 });
    expect(buy.status).toBe(200);
    expect(buy.body.balance).toBe(900);
    expect(buy.body.market.outcomes[0].probability).toBeGreaterThan(0.5);
    expect(buy.body.market.volume).toBe(100);
    const shares = buy.body.positions[0].shares;
    expect(shares).toBeGreaterThan(100);

    const tooMuch = await bob.post(`/markets/${id}/trade`, { side: 'sell', outcomeId: yes, shares: shares + 1 });
    expect(tooMuch.status).toBe(400);

    const sell = await bob.post(`/markets/${id}/trade`, { side: 'sell', outcomeId: yes, shares });
    expect(sell.status).toBe(200);
    expect(sell.body.balance).toBeCloseTo(1000, 1);
    expect(sell.body.balance).toBeLessThanOrEqual(1000);
    expect(sell.body.positions).toEqual([]);
    expect(sell.body.market.outcomes[0].probability).toBeCloseTo(0.5, 6);
  });

  it('rejects overspending, slippage and trading after close', async () => {
    const env = setup();
    const admin = await env.register('admin');
    const id = await makeMarket(env, admin);
    const yes = (await admin.get(`/markets/${id}`)).body.market.outcomes[0].id;

    expect((await admin.post(`/markets/${id}/trade`, { side: 'buy', outcomeId: yes, amount: 5000 })).status).toBe(400);
    expect(
      (await admin.post(`/markets/${id}/trade`, { side: 'buy', outcomeId: yes, amount: 10, minShares: 1000 })).status,
    ).toBe(409);
    expect((await admin.get('/auth/me')).body.user.balance).toBe(1000);

    env.clock.now += 3 * DAY;
    expect((await admin.get(`/markets/${id}`)).body.market.status).toBe('closed');
    expect((await admin.post(`/markets/${id}/trade`, { side: 'buy', outcomeId: yes, amount: 10 })).status).toBe(409);
  });

  it('resolves: winners get 1 per share, losers nothing, leaderboard reflects it', async () => {
    const env = setup();
    const admin = await env.register('admin');
    const bob = await env.register('bob');
    const carol = await env.register('carol');
    const id = await makeMarket(env, admin, ['A', 'B', 'C']);
    const [a, b] = (await bob.get(`/markets/${id}`)).body.market.outcomes.map((o: any) => o.id);

    const bobBuy = await bob.post(`/markets/${id}/trade`, { side: 'buy', outcomeId: a, amount: 200 });
    await carol.post(`/markets/${id}/trade`, { side: 'buy', outcomeId: b, amount: 300 });
    const bobShares = bobBuy.body.positions[0].shares as number;

    expect((await bob.post(`/markets/${id}/resolve`, { outcomeId: a })).status).toBe(403);
    const resolved = await admin.post(`/markets/${id}/resolve`, { outcomeId: a, note: 'A 赢了' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.status).toBe('resolved');
    expect(resolved.body.outcomes[0].probability).toBe(1);

    const bobMe = (await bob.get('/auth/me')).body.user;
    expect(bobMe.balance).toBeCloseTo(800 + bobShares, 2);
    expect((await carol.get('/auth/me')).body.user.balance).toBe(700);

    const portfolio = (await bob.get('/portfolio')).body;
    expect(portfolio.positions[0].state).toBe('won');
    expect(portfolio.stats.profit).toBeCloseTo(bobShares - 200, 2);

    const board = (await bob.get('/leaderboard')).body;
    expect(board[0].user.username).toBe('bob');
    expect(board[board.length - 1].user.username).toBe('carol');

    expect((await admin.post(`/markets/${id}/resolve`, { outcomeId: b })).status).toBe(409);
  });

  it('cancel refunds net spend', async () => {
    const env = setup();
    const admin = await env.register('admin');
    const bob = await env.register('bob');
    const id = await makeMarket(env, admin);
    const yes = (await bob.get(`/markets/${id}`)).body.market.outcomes[0].id;
    const buy = await bob.post(`/markets/${id}/trade`, { side: 'buy', outcomeId: yes, amount: 100 });
    await bob.post(`/markets/${id}/trade`, { side: 'sell', outcomeId: yes, shares: buy.body.positions[0].shares / 2 });
    const res = await admin.post(`/markets/${id}/cancel`, { note: '题目有歧义' });
    expect(res.body.status).toBe('cancelled');
    expect((await bob.get('/auth/me')).body.user.balance).toBe(1000);
    const ledger = (await bob.get('/portfolio/ledger')).body;
    expect(ledger.map((l: any) => l.kind)).toEqual(['refund', 'sell', 'buy', 'signup']);
  });

  it('history, holders, comments and activity endpoints work', async () => {
    const env = setup();
    const admin = await env.register('admin');
    const id = await makeMarket(env, admin);
    const yes = (await admin.get(`/markets/${id}`)).body.market.outcomes[0].id;
    env.clock.now += HOUR;
    await admin.post(`/markets/${id}/trade`, { side: 'buy', outcomeId: yes, amount: 50 });
    env.clock.now += HOUR;

    const history = (await admin.get(`/markets/${id}/history?range=all`)).body;
    expect(history.length).toBe(3);
    expect(history[0].probs).toEqual([0.5, 0.5]);
    expect(history[2].t).toBe(env.clock.now);

    const holders = (await admin.get(`/markets/${id}/holders`)).body;
    expect(holders).toHaveLength(1);

    const comment = await admin.post(`/markets/${id}/comments`, { body: '我觉得会下雨' });
    expect(comment.status).toBe(201);
    expect((await admin.get(`/markets/${id}/comments`)).body[0].body).toBe('我觉得会下雨');
    expect((await admin.del(`/comments/${comment.body.id}`)).status).toBe(200);

    const activity = (await env.client().get('/activity')).body;
    expect(activity[0]).toMatchObject({ side: 'buy', amount: 50, outcomeLabel: '是' });

    const list = (await env.client().get('/markets?sort=trending')).body;
    expect(list).toHaveLength(1);
    expect(list[0].traderCount).toBe(1);

    const stats = (await env.client().get('/stats')).body;
    expect(stats).toMatchObject({ openMarkets: 1, totalVolume: 50, traders: 1, users: 1 });
  });

  it('validates market creation', async () => {
    const env = setup();
    const admin = await env.register('admin');
    const base = { question: '这是一个问题吗？', category: '其他', closeAt: env.clock.now + DAY };
    expect((await admin.post('/markets', { ...base, outcomes: ['是'] })).status).toBe(400);
    expect((await admin.post('/markets', { ...base, outcomes: ['是', '是'] })).status).toBe(400);
    expect((await admin.post('/markets', { ...base, closeAt: env.clock.now, outcomes: ['是', '否'] })).status).toBe(
      400,
    );
    const skewed = await admin.post('/markets', { ...base, outcomes: ['是', '否'], initialProbability: 0.8 });
    expect(skewed.status).toBe(201);
    const m = (await admin.get(`/markets/${skewed.body.id}`)).body.market;
    expect(m.outcomes[0].probability).toBeCloseTo(0.8, 6);
  });
});

describe('admin', () => {
  it('grants currency, changes roles and resets passwords', async () => {
    const env = setup();
    const admin = await env.register('admin');
    const bob = await env.register('bob');
    const users = (await admin.get('/admin/users')).body;
    const bobId = users.find((u: any) => u.username === 'bob').id;

    expect((await bob.get('/admin/users')).status).toBe(403);
    expect((await admin.post(`/admin/users/${bobId}/grant`, { amount: 250, note: '奖励' })).body.balance).toBe(1250);
    expect((await admin.post(`/admin/users/${bobId}/grant`, { amount: -5000 })).status).toBe(400);

    await admin.post(`/admin/users/${bobId}/role`, { role: 'admin' });
    expect((await bob.get('/auth/me')).body.user.role).toBe('admin');

    await admin.post(`/admin/users/${bobId}/password`, { newPassword: 'newpass1' });
    expect((await bob.get('/auth/me')).body.user).toBeNull();
    expect((await bob.post('/auth/login', { username: 'bob', password: 'newpass1' })).status).toBe(200);
  });
});
