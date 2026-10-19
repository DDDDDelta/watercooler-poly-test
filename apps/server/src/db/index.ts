import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { migrations } from './migrations';

export type DB = Database.Database;

export function openDatabase(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

function migrate(db: DB): void {
  let current = db.pragma('user_version', { simple: true }) as number;
  // The pre-upstream Polymarket fork used versions 3–6 for what are now 5–8.
  // Identify that lineage by schema, add upstream's 3–4 atomically, then resume.
  const columns = db.prepare('PRAGMA table_info(markets)').all() as { name: string }[];
  if (
    current >= 3 &&
    current <= 6 &&
    columns.some((c) => c.name === 'mode') &&
    !columns.some((c) => c.name === 'is_ai')
  ) {
    db.transaction(() => {
      db.exec(migrations[2]!);
      db.exec(migrations[3]!);
      db.pragma(`user_version = ${current + 2}`);
    })();
    current += 2;
  }
  for (let v = current; v < migrations.length; v++) {
    db.transaction(() => {
      db.exec(migrations[v]!);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

/** `IN (?, ?, ...)` placeholder list for an array of bound values. */
export function placeholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(', ') || 'NULL';
}
