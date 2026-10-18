import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db';
import { migrations } from '../src/db/migrations';

describe('upstream and Polymarket database upgrades', () => {
  const cases = [
    ...[2, 3, 4].map((version) => ({ lineage: 'upstream', version, sql: migrations.slice(0, version) })),
    ...[3, 4, 5, 6].map((version) => ({
      lineage: 'fork',
      version,
      sql: [...migrations.slice(0, 2), ...migrations.slice(4, version + 2)],
    })),
  ];
  it.each(cases)('preserves assets from $lineage version $version and can reopen', ({ lineage, version, sql }) => {
    const dir = mkdtempSync(join(tmpdir(), 'wc-migrate-'));
    const path = join(dir, 'db.sqlite');
    let db = new Database(path);
    try {
      // Fixture setup need not fsync every statement; upgrades still use the real opener.
      db.pragma('journal_mode = MEMORY');
      db.pragma('synchronous = OFF');
      for (const migration of sql) db.exec(migration);
      db.pragma(`user_version = ${version}`);
      db.exec(`
        INSERT INTO users(id,username,display_name,password_hash,balance,created_at) VALUES (1,'old','old','hash',90000,0);
        INSERT INTO markets(id,question,category,creator_id,close_at,pot,created_at) VALUES (1,'old market','生活',1,100,10000,0);
        INSERT INTO outcomes(id,market_id,idx,label,pool) VALUES (1,1,0,'是',10000),(2,1,1,'否',0);
        INSERT INTO bets(user_id,market_id,outcome_id,amount,created_at) VALUES (1,1,1,10000,0);
        INSERT INTO ledger(user_id,kind,amount,balance_after,market_id,created_at) VALUES (1,'bet',-10000,90000,1,0);
      `);
      if (lineage === 'fork') {
        db.exec(`
          INSERT INTO markets(id,question,category,creator_id,close_at,pot,created_at,mode) VALUES (2,'exchange','生活',1,200,1000,0,'polymarket');
          INSERT INTO outcomes(id,market_id,idx,label) VALUES (3,2,0,'Yes'),(4,2,1,'No');
          INSERT INTO exchange_positions(user_id,market_id,outcome_id,quantity,reserved) VALUES (1,2,3,10,2),(1,2,4,10,0);
          INSERT INTO exchange_orders(user_id,market_id,outcome_id,side,price,quantity,remaining,created_at) VALUES (1,2,3,'sell',60,2,2,0);
        `);
        if (version === 6) db.exec('UPDATE markets SET settle_at = close_at + 50');
      }
      db.close();
      db = openDatabase(path);
      expect(db.pragma('user_version', { simple: true })).toBe(migrations.length);
      expect(db.prepare('SELECT balance,is_bot FROM users').get()).toEqual({ balance: 90000, is_bot: 0 });
      expect(db.prepare('SELECT mode,is_ai,pot,settle_at FROM markets WHERE id = 1').get()).toEqual({
        mode: 'pool',
        is_ai: 0,
        pot: 10000,
        settle_at: lineage === 'fork' && version === 6 ? 150 : 100,
      });
      expect(db.prepare('SELECT kind,amount FROM ledger').get()).toEqual({ kind: 'bet', amount: -10000 });
      expect(db.prepare('SELECT amount FROM bets').get()).toEqual({ amount: 10000 });
      expect(db.prepare('SELECT COUNT(*) AS n FROM wecom_bindings').get()).toEqual({ n: 0 });
      if (lineage === 'fork') {
        expect(db.prepare('SELECT quantity,reserved FROM exchange_positions WHERE outcome_id = 3').get()).toEqual({
          quantity: 10,
          reserved: 2,
        });
        expect(db.prepare('SELECT price,remaining,post_only,client_order_id FROM exchange_orders').get()).toEqual({
          price: 60,
          remaining: 2,
          post_only: 0,
          client_order_id: null,
        });
        expect(db.prepare('SELECT pot FROM markets WHERE id = 2').get()).toEqual({ pot: 1000 });
      }
      db.close();
      db = openDatabase(path);
      expect(db.prepare('SELECT balance FROM users').get()).toEqual({ balance: 90000 });
      expect(db.pragma('foreign_key_check')).toEqual([]);
    } finally {
      if (db.open) db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
