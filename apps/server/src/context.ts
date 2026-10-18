import type { Context } from 'hono';
import type { Config } from './config';
import type { DB } from './db';
import { unauthorized } from './lib/http';
import type { UserRow } from './services/users';

export interface AppDeps {
  db: DB;
  config: Config;
  /** Injectable clock, for tests and seeding. */
  now: () => number;
}

export interface AppEnv {
  Variables: {
    user: UserRow | null;
  };
}

export type Ctx = Context<AppEnv>;

export function requireUser(c: Ctx): UserRow {
  const user = c.get('user');
  if (!user) throw unauthorized();
  return user;
}
