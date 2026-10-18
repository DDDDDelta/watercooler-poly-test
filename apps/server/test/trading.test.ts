import { afterEach, expect, it } from 'vitest';
import { setup } from './helpers';

const envs: ReturnType<typeof setup>[] = [];
afterEach(() => {
  for (const e of envs.splice(0)) e.db.close();
});
async function fixture(privateMode = false) {
  const e = setup({ privateMode });
  envs.push(e);
  const alice = await e.register('alice');
  const bob = await e.register('bob');
  const id = (
    await alice.post('/markets', {
      question: '明天会下雨吗？',
      category: '生活',
      mode: 'polymarket',
      outcomes: ['Yes', 'No'],
      closeAt: e.clock.now + 86400000,
    })
  ).body.id;
  const outcomes = (await alice.get(`/markets/${id}`)).body.market.outcomes;
  return { ...e, alice, bob, id, yes: outcomes[0].id, no: outcomes[1].id };
}

it('offers authenticated idempotent submission, single-order lookup and idempotent cancellation', async () => {
  const e = await fixture();
  const input = { marketId: e.id, outcomeId: e.yes, side: 'buy', price: 0.4, quantity: 10, clientOrderId: 'bot:001' };
  expect((await e.client().post('/trading/orders', input)).status).toBe(401);
  const placed = await e.alice.post('/trading/orders', input);
  expect(placed.status).toBe(201);
  const order = placed.body;
  expect(order).toMatchObject({ marketId: e.id, clientOrderId: 'bot:001', remaining: 10 });
  expect((await e.alice.post('/trading/orders', input)).body.id).toBe(order.id);
  expect((await e.alice.get('/trading/account')).body.user.balance).toBe(996);
  expect((await e.alice.post('/trading/orders', { ...input, quantity: 11 })).status).toBe(409);
  expect((await e.bob.get(`/trading/orders/${order.id}`)).status).toBe(404);
  expect((await e.bob.post(`/trading/orders/${order.id}/cancel`)).status).toBe(404);
  expect((await e.alice.get(`/trading/orders/${order.id}`)).body.id).toBe(order.id);
  expect((await e.alice.get('/trading/orders?clientOrderId=bot%3A001')).body.items[0].id).toBe(order.id);
  for (let i = 0; i < 2; i++)
    expect((await e.alice.post(`/trading/orders/${order.id}/cancel`)).body.status).toBe('cancelled');
  expect((await e.alice.get('/trading/account')).body.user.balance).toBe(1000);
  e.clock.now += 2 * 86400000;
  expect((await e.alice.post('/trading/orders', input)).body.status).toBe('cancelled');
  expect((await e.alice.get('/trading/account')).body.user.balance).toBe(1000);
});

it('paginates orders and fills, preserves ownership and prices complementary fills per trader', async () => {
  const e = await fixture();
  for (let i = 0; i < 3; i++) {
    await e.alice.post('/trading/orders', {
      marketId: e.id,
      outcomeId: e.yes,
      side: 'buy',
      price: 0.4,
      quantity: 2,
      clientOrderId: `a-${i}`,
    });
    await e.bob.post('/trading/orders', {
      marketId: e.id,
      outcomeId: e.no,
      side: 'buy',
      price: 0.7,
      quantity: 2,
      clientOrderId: `b-${i}`,
    });
  }
  const a = (await e.alice.get('/trading/trades?limit=1')).body;
  expect(a.items[0]).toMatchObject({ outcomeId: e.yes, price: 0.4, role: 'maker', kind: 'mint', amount: 0.8 });
  const b = (await e.bob.get('/trading/trades?limit=1')).body;
  expect(b.items[0]).toMatchObject({ outcomeId: e.no, price: 0.6, role: 'taker', amount: 1.2 });
  const next = (await e.alice.get(`/trading/trades?before=${a.nextCursor}&limit=2`)).body;
  expect(next.items).toHaveLength(2);
  expect(next.items.every((x: { id: number }) => x.id < a.nextCursor)).toBe(true);
  expect(next.nextCursor).toBeNull();
  const orders = (await e.alice.get('/trading/orders?limit=1&status=filled')).body;
  expect(orders.items).toHaveLength(1);
  expect(orders.nextCursor).not.toBeNull();
  expect((await e.alice.get(`/trading/orders?before=${orders.nextCursor}&status=filled`)).body.items).toHaveLength(2);
  expect((await e.client().get(`/trading/markets/${e.id}/trades?limit=2`)).body.items).toHaveLength(2);
  expect((await e.client().get(`/trading/markets/${e.id}/book`)).body.collateral).toBe(6);
  expect((await e.alice.get('/trading/positions')).body[0].quantity).toBe(6);
  for (const path of [
    '/trading/orders?limit=201',
    '/trading/orders?status=bad',
    '/trading/trades?before=NaN',
    '/markets?mode=bad',
  ])
    expect((await e.alice.get(path)).status).toBe(400);
});

it('uses existing private mode and split/merge protection on trading endpoints', async () => {
  const e = await fixture(true);
  expect((await e.client().get(`/trading/markets/${e.id}/book`)).status).toBe(401);
  expect((await e.client().get('/trading/account')).status).toBe(401);
  const split = await e.alice.post(`/trading/markets/${e.id}/split`, { quantity: 5 });
  expect(split.body).toMatchObject({ balance: 995, collateral: 5 });
  const merged = await e.alice.post(`/trading/markets/${e.id}/merge`, { quantity: 5 });
  expect(merged.body).toMatchObject({ balance: 1000, collateral: 0 });
  expect((await e.alice.post(`/trading/markets/${e.id}/split`, { quantity: 0.5 })).status).toBe(400);
  expect((await e.alice.get('/markets?mode=pool')).body).toEqual([]);
  expect((await e.alice.get('/markets?mode=polymarket')).body).toHaveLength(1);
});

it.each([
  ['direct buy', 'yes', 'sell', 0.4, 'buy', 0.4],
  ['direct sell', 'yes', 'buy', 0.6, 'sell', 0.6],
  ['complementary mint', 'no', 'buy', 0.6, 'buy', 0.4],
  ['complementary merge', 'no', 'sell', 0.6, 'sell', 0.4],
] as const)(
  'rejects post-only %s atomically even when only part could fill',
  async (_name, makerOutcome, makerSide, makerPrice, side, price) => {
    const e = await fixture();
    await e.alice.post(`/trading/markets/${e.id}/split`, { quantity: 10 });
    await e.bob.post(`/trading/markets/${e.id}/split`, { quantity: 10 });
    await e.bob.post('/trading/orders', {
      marketId: e.id,
      outcomeId: makerOutcome === 'yes' ? e.yes : e.no,
      side: makerSide,
      price: makerPrice,
      quantity: 2,
    });
    const snapshot = () =>
      ['users', 'ledger', 'exchange_positions', 'exchange_orders', 'exchange_trades', 'markets', 'price_history'].map(
        (table) => e.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      );
    const before = snapshot();
    const input = {
      marketId: e.id,
      outcomeId: e.yes,
      side,
      price,
      quantity: 5,
      postOnly: true,
      clientOrderId: 'post-rejected',
    };
    const rejected = await e.alice.post('/trading/orders', input);
    expect(rejected.status).toBe(409);
    expect(rejected.body.error).toContain('Post-only');
    expect(snapshot()).toEqual(before);
    // The original market-scoped route must enforce the same guard.
    expect((await e.alice.post(`/markets/${e.id}/orders`, input)).status).toBe(409);
    expect(snapshot()).toEqual(before);
  },
);

it('rests post-only orders, allows later maker fills, and includes the flag in idempotency', async () => {
  const e = await fixture();
  const input = {
    marketId: e.id,
    outcomeId: e.yes,
    side: 'buy',
    price: 0.3,
    quantity: 5,
    postOnly: true,
    clientOrderId: 'post-resting',
  };
  const maker = (await e.alice.post('/trading/orders', input)).body;
  expect(maker).toMatchObject({ postOnly: true, remaining: 5, status: 'open' });
  expect((await e.alice.post('/trading/orders', input)).body.id).toBe(maker.id);
  expect((await e.alice.post('/trading/orders', { ...input, postOnly: false })).status).toBe(409);
  expect((await e.alice.post('/trading/orders', { ...input, clientOrderId: 'invalid', postOnly: 'true' })).status).toBe(
    400,
  );
  await e.bob.post(`/trading/markets/${e.id}/split`, { quantity: 2 });
  const taker = await e.bob.post('/trading/orders', {
    marketId: e.id,
    outcomeId: e.yes,
    side: 'sell',
    price: 0.3,
    quantity: 2,
  });
  expect(taker.body.postOnly).toBe(false);
  expect(taker.body.status).toBe('filled');
  expect((await e.alice.get(`/trading/orders/${maker.id}`)).body).toMatchObject({ postOnly: true, remaining: 3 });
  expect((await e.alice.get('/trading/trades')).body.items[0]).toMatchObject({
    role: 'maker',
    price: 0.3,
    quantity: 2,
  });
  await e.alice.post(`/trading/orders/${maker.id}/cancel`);
  expect((await e.alice.get('/trading/account')).body.user.balance).toBe(999.4);
});

it('does not reject post-only orders solely because of own crossed orders', async () => {
  const e = await fixture();
  await e.alice.post(`/trading/markets/${e.id}/split`, { quantity: 4 });
  await e.alice.post('/trading/orders', { marketId: e.id, outcomeId: e.yes, side: 'sell', price: 0.4, quantity: 2 });
  const result = await e.alice.post('/trading/orders', {
    marketId: e.id,
    outcomeId: e.yes,
    side: 'buy',
    price: 0.5,
    quantity: 2,
    postOnly: true,
  });
  expect(result.status).toBe(201);
  expect(result.body).toMatchObject({ postOnly: true, remaining: 2, status: 'open' });
  expect((await e.alice.get('/trading/trades')).body.items).toEqual([]);
});
