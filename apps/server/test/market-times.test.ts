import { expect, it } from 'vitest';
import { setup } from './helpers';

const DAY = 86400000;

it.each(['pool', 'polymarket'] as const)(
  'separates close and settlement, preserving unresolved assets indefinitely in %s mode',
  async (mode) => {
    const e = setup();
    try {
      const creator = await e.register('creator');
      const trader = await e.register('trader');
      const closeAt = e.clock.now + DAY;
      // Trading can stop long before the result is available.
      const settleAt = closeAt + 10 * DAY;
      const input = {
        question: '分开设置交易与结算时间？',
        category: '其他',
        mode,
        closeAt,
        settleAt,
        outcomes: ['Yes', 'No'],
      };
      for (const invalid of [closeAt - 1, null, 'tomorrow', 1.5, e.clock.now + 6 * 365 * DAY]) {
        expect((await creator.post('/markets', { ...input, settleAt: invalid })).status).toBe(400);
      }
      const id = (await creator.post('/markets', input)).body.id;
      const delayed = (await creator.post('/markets', input)).body.id;
      const path = `/markets/${id}`;
      const market = (await trader.get(path)).body.market;
      expect(market).toMatchObject({ closeAt, settleAt, status: 'open' });
      expect(market).not.toHaveProperty('resolveBy');
      expect((await trader.get('/markets')).body[0].settleAt).toBe(settleAt);
      const yes = market.outcomes[0].id;
      const delayedYes = (await trader.get(`/markets/${delayed}`)).body.market.outcomes[0].id;
      if (mode === 'polymarket') {
        await trader.post(`/markets/${delayed}/split`, { quantity: 10 });
        await trader.post(`${path}/split`, { quantity: 10 });
        await trader.post(`${path}/orders`, { outcomeId: yes, side: 'sell', price: 0.8, quantity: 2 });
        await creator.post(`${path}/orders`, { outcomeId: yes, side: 'buy', price: 0.2, quantity: 2 });
      } else {
        await trader.post(`/markets/${delayed}/bets`, { outcomeId: delayedYes, amount: 10 });
        await trader.post(`${path}/bets`, { outcomeId: yes, amount: 10 });
      }
      const ledgerCount = () => (e.db.prepare('SELECT COUNT(*) AS n FROM ledger').get() as { n: number }).n;
      const before = ledgerCount();
      expect((await creator.post(`${path}/resolve`, { outcomeId: yes })).status).toBe(409);
      expect(ledgerCount()).toBe(before);

      e.clock.now = closeAt;
      expect((await trader.get(path)).body.market.status).toBe('closed');
      if (mode === 'polymarket') {
        const exchange = (await trader.get(`${path}/exchange`)).body;
        expect(exchange.orders[0].status).toBe('cancelled');
        expect(exchange.positions.every((p: { reserved: number }) => p.reserved === 0)).toBe(true);
        expect((await creator.get('/auth/me')).body.user.balance).toBe(1000);
        expect(
          (await trader.post(`${path}/orders`, { outcomeId: yes, side: 'buy', price: 0.4, quantity: 1 })).status,
        ).toBe(409);
        expect((await trader.post(`${path}/split`, { quantity: 1 })).status).toBe(409);
      } else {
        expect((await trader.post(`${path}/bets`, { outcomeId: yes, amount: 1 })).status).toBe(409);
      }
      e.clock.now = settleAt - 1;
      expect((await trader.get(path)).body.market.status).toBe('closed');
      expect((await trader.get('/auth/me')).body.user.balance).toBe(980);
      expect((await creator.post(`${path}/resolve`, { outcomeId: yes })).status).toBe(409);
      e.clock.now = settleAt;
      expect((await trader.get(path)).body.market).toMatchObject({ status: 'closed', resolvedAt: null });
      expect((await creator.post(`${path}/resolve`, { outcomeId: yes })).body).toMatchObject({
        status: 'resolved',
        resolvedAt: settleAt,
      });
      expect((await trader.get('/auth/me')).body.user.balance).toBe(990);
      expect((await creator.post(`${path}/resolve`, { outcomeId: yes })).status).toBe(409);

      e.clock.now = settleAt + 7 * DAY - 1;
      expect((await trader.get(`/markets/${delayed}`)).body.market.status).toBe('closed');
      e.clock.now++;
      expect((await trader.get(`/markets/${delayed}`)).body.market.status).toBe('closed');
      const beforeWaiting = ledgerCount();
      e.clock.now = settleAt + 365 * DAY;
      expect((await e.client().get(`/markets/${delayed}`)).body.market).toMatchObject({
        status: 'closed',
        resolvedAt: null,
        pot: 10,
      });
      expect(ledgerCount()).toBe(beforeWaiting);
      // Sessions expire normally; log in again without affecting market assets.
      expect((await creator.post('/auth/login', { username: 'creator', password: 'secret123' })).status).toBe(200);
      expect((await trader.post('/auth/login', { username: 'trader', password: 'secret123' })).status).toBe(200);
      expect((await trader.get('/auth/me')).body.user.balance).toBe(990);
      if (mode === 'polymarket') {
        const exchange = (await trader.get(`/markets/${delayed}/exchange`)).body;
        expect(exchange.collateral).toBe(10);
        expect(exchange.positions.map((p: { quantity: number }) => p.quantity)).toEqual([10, 10]);
      }
      expect((await creator.post(`/markets/${delayed}/resolve`, { outcomeId: delayedYes })).status).toBe(200);
      expect((await trader.get('/auth/me')).body.user.balance).toBe(1000);
    } finally {
      e.db.close();
    }
  },
);
