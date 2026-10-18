import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { migrations } from '../src/db/migrations';
import { cancelOrder, placeOrder, splitMerge } from '../src/services/exchange';
import { resolveMarket } from '../src/services/bets';
import { HttpError } from '../src/lib/http';
import { setup } from './helpers';

const environments: ReturnType<typeof setup>[] = [];
afterEach(() => {
  for (const e of environments.splice(0)) e.db.close();
});

async function fixture() {
  const env = setup();
  environments.push(env);
  const alice = await env.register('alice');
  const bob = await env.register('bob');
  const carol = await env.register('carol');
  const created = await alice.post('/markets', {
    question: '明天会下雨吗？',
    category: '生活',
    mode: 'polymarket',
    outcomes: ['Yes', 'No'],
    closeAt: env.clock.now + 86400000,
  });
  expect(created.status).toBe(201);
  const id = created.body.id as number;
  const market = (await alice.get(`/markets/${id}`)).body.market;
  const [yes, no] = market.outcomes.map((o: { id: number }) => o.id) as [number, number];
  const base = `/markets/${id}`;
  const order = (c: typeof alice, outcomeId: number, side: 'buy' | 'sell', price: number, quantity: number) =>
    c.post(`${base}/orders`, { outcomeId, side, price, quantity });
  const state = async (c = alice) => (await c.get(`${base}/exchange`)).body;
  const balance = async (c = alice) => (await c.get('/auth/me')).body.user.balance;
  return { ...env, alice, bob, carol, id, yes, no, base, order, state, balance };
}

describe('Polymarket exchange', () => {
  it('preserves shipped pool data when applying the new migration', () => {
    const db = new Database(':memory:');
    try {
      for (const sql of migrations.slice(0, -1)) db.exec(sql);
      db.exec(`INSERT INTO users(id,username,display_name,password_hash,balance,created_at) VALUES (1,'old','old','hash',90000,0);
        INSERT INTO markets(id,question,category,creator_id,close_at,pot,created_at) VALUES (1,'old market','生活',1,100,10000,0);
        INSERT INTO outcomes(id,market_id,idx,label,pool) VALUES (1,1,0,'是',10000),(2,1,1,'否',0);
        INSERT INTO bets(user_id,market_id,outcome_id,amount,created_at) VALUES (1,1,1,10000,0);
        INSERT INTO ledger(user_id,kind,amount,balance_after,market_id,created_at) VALUES (1,'bet',-10000,90000,1,0);`);
      db.exec(migrations.at(-1)!);
      expect(db.prepare('SELECT mode,pot FROM markets').get()).toEqual({ mode: 'pool', pot: 10000 });
      expect(db.prepare('SELECT close_at,settle_at FROM markets').get()).toEqual({ close_at: 100, settle_at: 100 });
      expect(db.prepare('SELECT balance FROM users').get()).toEqual({ balance: 90000 });
      expect(db.prepare('SELECT kind,amount FROM ledger').get()).toEqual({ kind: 'bet', amount: -10000 });
      expect(db.prepare('SELECT amount FROM bets').get()).toEqual({ amount: 10000 });
    } finally {
      db.close();
    }
  });

  it('splits and merges complete sets, tracks locked assets and rejects overspending/overselling', async () => {
    const e = await fixture();
    expect((await e.alice.post(`${e.base}/split`, { quantity: 10 })).status).toBe(200);
    expect(await e.balance()).toBe(990);
    expect((await e.state()).positions.map((p: any) => p.quantity)).toEqual([10, 10]);
    expect((await e.alice.get('/portfolio')).body.stats.netWorth).toBe(1000);
    const ask = await e.order(e.alice, e.yes, 'sell', 0.6, 7);
    expect(ask.status).toBe(201);
    expect((await e.order(e.alice, e.yes, 'sell', 0.6, 4)).status).toBe(400);
    expect((await e.alice.post(`${e.base}/merge`, { quantity: 4 })).status).toBe(400);
    expect((await e.alice.post(`${e.base}/merge`, { quantity: 3 })).status).toBe(200);
    expect((await e.bob.post(`${e.base}/orders/${ask.body.id}/cancel`)).status).toBe(403);
    await e.alice.post(`${e.base}/orders/${ask.body.id}/cancel`);
    await e.alice.post(`${e.base}/merge`, { quantity: 7 });
    expect(await e.balance()).toBe(1000);
    expect((await e.state()).collateral).toBe(0);
    expect((await e.alice.post(`${e.base}/split`, { quantity: 1001 })).status).toBe(400);
  });

  it('matches best prices then FIFO, partially fills and refunds limit price improvement', async () => {
    const e = await fixture();
    await e.bob.post(`${e.base}/split`, { quantity: 10 });
    await e.carol.post(`${e.base}/split`, { quantity: 10 });
    const expensive = (await e.order(e.bob, e.yes, 'sell', 0.6, 4)).body;
    const first = (await e.order(e.bob, e.yes, 'sell', 0.4, 3)).body;
    const second = (await e.order(e.carol, e.yes, 'sell', 0.4, 5)).body;
    const bought = (await e.order(e.alice, e.yes, 'buy', 0.7, 6)).body;
    expect(bought.remaining).toBe(0);
    expect(await e.balance()).toBe(997.6);
    const rows = e.db
      .prepare('SELECT id,remaining,status FROM exchange_orders WHERE id IN (?,?,?) ORDER BY id')
      .all(expensive.id, first.id, second.id);
    expect(rows).toEqual([
      { id: expensive.id, remaining: 4, status: 'open' },
      { id: first.id, remaining: 0, status: 'filled' },
      { id: second.id, remaining: 2, status: 'open' },
    ]);
    expect((await e.state()).trades.map((t: any) => [t.price, t.quantity])).toEqual([
      [0.4, 3],
      [0.4, 3],
    ]);
    const bid = (await e.order(e.alice, e.yes, 'buy', 0.3, 10)).body;
    expect((await e.alice.get('/portfolio')).body.stats.balance).toBe(994.6);
    expect((await e.alice.get('/portfolio')).body.stats.staked).toBeGreaterThanOrEqual(3);
    await e.alice.post(`${e.base}/orders/${bid.id}/cancel`);
    expect(await e.balance()).toBe(997.6);
  });

  it('mints complementary buys with maker pricing and combines direct/implied liquidity by price', async () => {
    const e = await fixture();
    await e.order(e.bob, e.no, 'buy', 0.65, 4);
    const implied = (await e.state()).books.find((b: any) => b.outcomeId === e.yes);
    expect(implied.asks).toEqual([{ price: 0.35, quantity: 4 }]);
    const incoming = await e.order(e.alice, e.yes, 'buy', 0.5, 6);
    expect(incoming.body.remaining).toBe(2);
    expect(await e.balance()).toBe(997.6); // 1.40 paid + 1.00 still locked
    expect(await e.balance(e.bob)).toBe(997.4);
    expect((await e.state()).collateral).toBe(4);
    expect((await e.state()).trades[0].kind).toBe('mint');
    await e.alice.post(`${e.base}/orders/${incoming.body.id}/cancel`);
    expect(await e.balance()).toBe(998.6);
    expect((await e.state()).positions.find((p: any) => p.outcomeId === e.yes).quantity).toBe(4);
  });

  it('merges complementary sell orders and releases exactly one unit per pair', async () => {
    const e = await fixture();
    await e.alice.post(`${e.base}/split`, { quantity: 5 });
    await e.bob.post(`${e.base}/split`, { quantity: 5 });
    await e.order(e.alice, e.yes, 'sell', 0.6, 5);
    const result = await e.order(e.bob, e.no, 'sell', 0.3, 3);
    expect(result.body.remaining).toBe(0);
    expect(await e.balance(e.bob)).toBe(996.2); // maker Yes .60 => taker No .40
    expect(await e.balance()).toBe(996.8);
    expect((await e.state()).collateral).toBe(7);
    expect((await e.state()).trades[0]).toMatchObject({ price: 0.4, quantity: 3, kind: 'merge' });
  });

  it('prioritizes the best effective price across direct and complementary orders', async () => {
    const e = await fixture();
    await e.order(e.bob, e.no, 'buy', 0.6, 5); // implied Yes ask .40
    await e.carol.post(`${e.base}/split`, { quantity: 5 });
    await e.order(e.carol, e.yes, 'sell', 0.35, 5); // newer but better than .40
    await e.order(e.alice, e.yes, 'buy', 0.5, 7);
    expect((await e.state()).trades.map((t: any) => [t.price, t.quantity, t.kind])).toEqual([
      [0.4, 2, 'mint'],
      [0.35, 5, 'transfer'],
    ]);
    expect(await e.balance()).toBe(997.45);
    expect((await e.state()).collateral).toBe(7);
    const pending = (await e.order(e.alice, e.yes, 'buy', 0.1, 2)).body;
    const portfolio = (await e.alice.get('/portfolio')).body;
    expect(portfolio.exchangeOrders).toContainEqual(
      expect.objectContaining({ id: pending.id, remaining: 2, marketId: e.id }),
    );
  });

  it('settles fixed winning-share payouts, unlocks orders, and prevents double settlement', async () => {
    const e = await fixture();
    await e.order(e.alice, e.yes, 'buy', 0.4, 100);
    await e.order(e.bob, e.no, 'buy', 0.6, 100);
    await e.order(e.carol, e.yes, 'buy', 0.2, 7);
    await e.order(e.alice, e.yes, 'sell', 0.8, 10);
    expect((await e.bob.post(`${e.base}/resolve`, { outcomeId: e.yes })).status).toBe(403);
    e.clock.now += 86400000;
    expect((await e.alice.post(`${e.base}/resolve`, { outcomeId: e.yes })).status).toBe(200);
    expect(await e.balance()).toBe(1060);
    expect(await e.balance(e.bob)).toBe(940);
    expect(await e.balance(e.carol)).toBe(1000);
    expect((await e.state()).collateral).toBe(0);
    expect((await e.state()).orders.some((o: any) => o.status === 'open')).toBe(false);
    expect((await e.alice.post(`${e.base}/resolve`, { outcomeId: e.yes })).status).toBe(409);
    expect((await e.order(e.alice, e.yes, 'buy', 0.4, 1)).status).toBe(409);
    expect((await e.alice.get('/portfolio')).body.stats.netWorth).toBe(1060);
  });

  it('cancels at 50/50 to current holders instead of reversing past trades', async () => {
    const e = await fixture();
    await e.alice.post(`${e.base}/split`, { quantity: 10 });
    await e.order(e.alice, e.yes, 'sell', 0.8, 10);
    await e.order(e.bob, e.yes, 'buy', 0.8, 10);
    await e.alice.post(`${e.base}/cancel`);
    expect(await e.balance()).toBe(1003); // sold Yes for 8 and retains 5 of No settlement
    expect(await e.balance(e.bob)).toBe(997);
    expect((await e.state()).collateral).toBe(0);
    expect((await e.alice.post(`${e.base}/merge`, { quantity: 1 })).status).toBe(409);
  });

  it('expires unmatched bids/asks at close and keeps collateral until resolution', async () => {
    const e = await fixture();
    await e.alice.post(`${e.base}/split`, { quantity: 4 });
    await e.order(e.alice, e.yes, 'sell', 0.8, 3);
    await e.order(e.bob, e.yes, 'buy', 0.2, 10);
    e.clock.now += 86400001;
    expect((await e.state()).orders.every((o: any) => o.status === 'cancelled')).toBe(true);
    expect(await e.balance(e.bob)).toBe(1000);
    expect((await e.state()).positions.every((p: any) => p.reserved === 0)).toBe(true);
    expect((await e.order(e.alice, e.no, 'sell', 0.4, 1)).status).toBe(409);
    e.clock.now += 8 * 86400000;
    expect((await e.alice.get(e.base)).body.market.status).toBe('closed');
    expect((await e.state()).collateral).toBe(4);
    expect(await e.balance()).toBe(996);
    expect((await e.alice.post(`${e.base}/resolve`, { outcomeId: e.yes })).status).toBe(200);
    expect(await e.balance()).toBe(1000);
  });

  it('validates mode, authentication, prices and share quantities, and does not self-trade', async () => {
    const e = await fixture();
    expect((await e.client().post(`${e.base}/split`, { quantity: 1 })).status).toBe(401);
    for (const quantity of [0, -1, 0.5, 1000001])
      expect((await e.alice.post(`${e.base}/split`, { quantity })).status).toBe(400);
    for (const price of [0, 1, 0.501]) expect((await e.order(e.alice, e.yes, 'buy', price, 1)).status).toBe(400);
    expect((await e.order(e.alice, e.yes, 'buy', 0.5, 1.5)).status).toBe(400);
    expect((await e.order(e.alice, e.yes, 'buy', 0.99, 1000000)).status).toBe(400);
    expect((await e.alice.post(`${e.base}/bets`, { outcomeId: e.yes, amount: 10 })).status).toBe(400);
    expect((await e.order(e.alice, 9999, 'buy', 0.5, 10)).status).toBe(404);
    await e.order(e.alice, e.yes, 'buy', 0.6, 10);
    await e.order(e.alice, e.no, 'buy', 0.5, 10);
    expect((await e.state()).trades).toEqual([]);
    expect((await e.state()).collateral).toBe(0);
    const invalid = await e.alice.post('/markets', {
      question: '无效的三个选项',
      category: '生活',
      mode: 'polymarket',
      outcomes: ['Yes', 'No', 'Maybe'],
      closeAt: e.clock.now + 86400000,
    });
    expect(invalid.status).toBe(400);
  });

  it('conserves cash, escrow, collateral and share reservations across a deterministic trading sequence', async () => {
    const e = await fixture();
    let seed = 419;
    const random = (n: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return (seed >>> 8) % n;
    };
    for (let step = 0; step < 300; step++) {
      const user = 1 + random(3);
      const quantity = 1 + random(8);
      try {
        const op = random(5);
        if (op < 2) splitMerge(e.db, user, e.id, quantity, op === 0 ? 'split' : 'merge', e.clock.now);
        else if (op === 2) {
          const o = e.db
            .prepare("SELECT id FROM exchange_orders WHERE user_id = ? AND status = 'open' ORDER BY id LIMIT 1")
            .get(user) as { id: number } | undefined;
          if (o) cancelOrder(e.db, user, e.id, o.id, e.clock.now);
        } else
          placeOrder(
            e.db,
            user,
            e.id,
            {
              outcomeId: random(2) ? e.yes : e.no,
              side: random(2) ? 'buy' : 'sell',
              price: (1 + random(99)) / 100,
              quantity,
            },
            e.clock.now,
          );
      } catch (err) {
        if (!(err instanceof HttpError)) throw err;
      }
      const cash = (e.db.prepare('SELECT SUM(balance) AS n FROM users').get() as any).n;
      const escrow = (
        e.db
          .prepare(
            "SELECT COALESCE(SUM(price * remaining),0) AS n FROM exchange_orders WHERE status = 'open' AND side = 'buy'",
          )
          .get() as any
      ).n;
      const collateral = (e.db.prepare('SELECT pot FROM markets WHERE id = ?').get(e.id) as any).pot;
      expect(cash + escrow + collateral).toBe(300000);
      for (const outcomeId of [e.yes, e.no]) {
        const shares = (
          e.db
            .prepare('SELECT COALESCE(SUM(quantity),0) AS n FROM exchange_positions WHERE outcome_id = ?')
            .get(outcomeId) as any
        ).n;
        expect(shares * 100).toBe(collateral);
      }
      const invalidReserved = e.db
        .prepare(
          `SELECT p.user_id FROM exchange_positions p WHERE reserved <>
        (SELECT COALESCE(SUM(remaining),0) FROM exchange_orders o WHERE o.user_id = p.user_id AND o.outcome_id = p.outcome_id AND o.side = 'sell' AND o.status = 'open')`,
        )
        .all();
      expect(invalidReserved).toEqual([]);
      expect(
        e.db
          .prepare(
            'SELECT u.id FROM users u WHERE balance <> (SELECT COALESCE(SUM(amount),0) FROM ledger l WHERE l.user_id = u.id)',
          )
          .all(),
      ).toEqual([]);
    }
    expect((e.db.prepare('SELECT COUNT(*) AS n FROM exchange_trades').get() as any).n).toBeGreaterThan(5);
    resolveMarket(e.db, e.id, e.yes, 1, undefined, e.clock.now + 86400000);
    expect((e.db.prepare('SELECT SUM(balance) AS n FROM users').get() as any).n).toBe(300000);
  });
});
