import { DAY, MINUTE } from '../lib/time';
import { expireExchangeOrders } from '../services/exchange';
import { cancelOverdueMarkets } from '../services/bets';
import type { MarketRow } from '../services/markets';
import { createAiMarket, placeAiBet, RECHECK_AFTER, resolveAiMarket, type BotDeps } from './agent';

const TICK = MINUTE;
const TICKS_PER_DAY = DAY / TICK;
/** Below this many open AI markets the bots write new ones right away (still within the daily cap). */
const MIN_OPEN_MARKETS = 3;
/** Pause after a failed attempt so a broken key or endpoint is not hammered every minute. */
const FAILURE_BACKOFF = 10 * MINUTE;

type Job = 'create' | 'bet' | 'resolve';

const count = (deps: BotDeps, sql: string, ...params: unknown[]) =>
  (deps.db.prepare(sql).get(...params) as { n: number }).n;

/**
 * Drive the bots once a minute: settle closed AI markets, keep a few questions open, and place
 * bets at random times. Daily caps come from bot.json; at most one job of each kind runs at a time.
 * Returns a function that stops the loop.
 */
export function startBots(deps: BotDeps, botIds: number[]): () => void {
  const random = deps.random ?? Math.random;
  const log = deps.log ?? ((m: string) => console.log(`[bots] ${m}`));
  const running = new Set<Job>();
  const failedAt = new Map<Job, number>();
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(random() * xs.length)]!;

  const run = (job: Job, work: () => Promise<unknown>) => {
    if (running.has(job) || deps.now() - (failedAt.get(job) ?? -Infinity) < FAILURE_BACKOFF) return;
    running.add(job);
    work()
      .then((result) => {
        // A failed question would otherwise be retried every minute while few markets are open.
        if (job === 'create' && result === null) failedAt.set(job, deps.now());
      })
      .catch((err: unknown) => {
        failedAt.set(job, deps.now());
        log(`${job} failed: ${err instanceof Error ? err.message : String(err)}`);
      })
      .finally(() => running.delete(job));
  };

  const tick = () => {
    const now = deps.now();
    expireExchangeOrders(deps.db, now);
    cancelOverdueMarkets(deps.db, now);
    const { bot, db } = deps;

    const due = db
      .prepare(
        `SELECT * FROM markets WHERE is_ai = 1 AND status = 'open' AND settle_at <= ?
            AND (ai_checked_at IS NULL OR ai_checked_at <= ?)
          ORDER BY settle_at LIMIT 1`,
      )
      .get(now, now - RECHECK_AFTER) as MarketRow | undefined;
    if (due) run('resolve', () => resolveAiMarket({ ...deps, log }, due));

    const open = db.prepare(`SELECT id FROM markets WHERE is_ai = 1 AND status = 'open' AND close_at > ?`).all(now) as {
      id: number;
    }[];
    // Writing a question is the expensive call, so every attempt counts against the cap, even failed ones.
    const attemptsToday = count(
      deps,
      `SELECT COUNT(*) AS n FROM bot_attempts WHERE kind = 'create' AND created_at > ?`,
      now - DAY,
    );
    if (
      attemptsToday < bot.marketsPerDay &&
      (open.length < MIN_OPEN_MARKETS || random() < bot.marketsPerDay / TICKS_PER_DAY)
    ) {
      run('create', () => {
        db.prepare(`INSERT INTO bot_attempts (kind, created_at) VALUES ('create', ?)`).run(now);
        return createAiMarket({ ...deps, log }, pick(botIds));
      });
    }

    const betsToday = count(
      deps,
      `SELECT COUNT(*) AS n FROM bets b JOIN users u ON u.id = b.user_id WHERE u.is_bot = 1 AND b.created_at > ?`,
      now - DAY,
    );
    if (open.length > 0 && betsToday < bot.betsPerDay && random() < bot.betsPerDay / TICKS_PER_DAY) {
      run('bet', () => placeAiBet({ ...deps, log }, pick(botIds), pick(open).id));
    }
  };

  const timer = setInterval(tick, TICK);
  timer.unref();
  const first = setTimeout(tick, 5_000);
  first.unref();
  return () => {
    clearInterval(timer);
    clearTimeout(first);
  };
}
