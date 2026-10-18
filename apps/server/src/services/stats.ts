import {
  fromCents,
  round2,
  type LeaderboardEntry,
  type LedgerEntry,
  type LedgerKind,
  type PortfolioBet,
  type PortfolioState,
  type SiteStats,
  type UserStats,
} from '@watercooler/shared';
import type { DB } from '../db';
import { derivedStatus, type MarketRow } from './markets';
import { toUserRef } from './users';

/** Stats for every user at once (cheap enough for an office-sized crowd). */
export function computeAllStats(db: DB): Map<number, UserStats> {
  const users = db.prepare('SELECT id, balance FROM users').all() as { id: number; balance: number }[];
  const stats = new Map<number, UserStats>();
  for (const u of users) {
    stats.set(u.id, {
      balance: fromCents(u.balance),
      staked: 0,
      netWorth: 0,
      funded: 0,
      profit: 0,
      betCount: 0,
      marketsBet: 0,
    });
  }

  const staked = db
    .prepare(
      `SELECT b.user_id, SUM(b.amount) AS total FROM bets b JOIN markets m ON m.id = b.market_id
        WHERE m.status = 'open' GROUP BY b.user_id`,
    )
    .all() as { user_id: number; total: number }[];
  for (const r of staked) {
    const s = stats.get(r.user_id);
    if (s) s.staked = fromCents(r.total);
  }

  const funded = db
    .prepare(`SELECT user_id, SUM(amount) AS total FROM ledger WHERE kind IN ('signup', 'bonus') GROUP BY user_id`)
    .all() as { user_id: number; total: number }[];
  for (const f of funded) {
    const s = stats.get(f.user_id);
    if (s) s.funded = fromCents(f.total);
  }

  const activity = db
    .prepare('SELECT user_id, COUNT(*) AS bets, COUNT(DISTINCT market_id) AS markets FROM bets GROUP BY user_id')
    .all() as { user_id: number; bets: number; markets: number }[];
  for (const a of activity) {
    const s = stats.get(a.user_id);
    if (s) {
      s.betCount = a.bets;
      s.marketsBet = a.markets;
    }
  }

  for (const s of stats.values()) {
    s.netWorth = round2(s.balance + s.staked);
    s.profit = round2(s.netWorth - s.funded);
  }
  return stats;
}

export type LeaderboardSort = 'profit' | 'netWorth' | 'bets';

export function leaderboard(db: DB, sort: LeaderboardSort = 'profit'): LeaderboardEntry[] {
  const stats = computeAllStats(db);
  const users = db.prepare('SELECT id, username, display_name FROM users').all() as {
    id: number;
    username: string;
    display_name: string;
  }[];
  const key = (s: UserStats) => (sort === 'netWorth' ? s.netWorth : sort === 'bets' ? s.betCount : s.profit);
  return users
    .map((u) => ({ user: toUserRef(u), stats: stats.get(u.id)! }))
    .sort((a, b) => key(b.stats) - key(a.stats) || b.stats.netWorth - a.stats.netWorth || a.user.id - b.user.id)
    .map((e, i) => ({ rank: i + 1, ...e }));
}

export function userStatsAndRank(db: DB, userId: number): { stats: UserStats; rank: number } {
  const board = leaderboard(db, 'profit');
  const entry = board.find((e) => e.user.id === userId);
  if (!entry) throw new Error(`unknown user ${userId}`);
  return { stats: entry.stats, rank: entry.rank };
}

/** All of a user's stakes, one row per outcome backed, live markets first. */
export function userBets(db: DB, userId: number, now: number): PortfolioBet[] {
  const rows = db
    .prepare(
      `SELECT b.outcome_id, SUM(b.amount) AS stake, o.label, o.pool, b.market_id,
              m.question, m.status, m.close_at, m.resolved_outcome_id, m.pot,
              (SELECT w.pool FROM outcomes w WHERE w.id = m.resolved_outcome_id) AS winner_pool,
              (SELECT COUNT(*) FROM outcomes x WHERE x.market_id = m.id)         AS outcome_count
         FROM bets b
         JOIN outcomes o ON o.id = b.outcome_id
         JOIN markets m  ON m.id = b.market_id
        WHERE b.user_id = ?
        GROUP BY b.outcome_id
        ORDER BY (m.status = 'open') DESC, m.close_at ASC, b.outcome_id`,
    )
    .all(userId) as {
    outcome_id: number;
    stake: number;
    label: string;
    pool: number;
    market_id: number;
    question: string;
    status: MarketRow['status'];
    close_at: number;
    resolved_outcome_id: number | null;
    pot: number;
    winner_pool: number | null;
    outcome_count: number;
  }[];
  const paid = new Map(
    (
      db
        .prepare(
          `SELECT market_id, SUM(amount) AS total FROM ledger WHERE user_id = ? AND kind = 'payout' GROUP BY market_id`,
        )
        .all(userId) as { market_id: number; total: number }[]
    ).map((r) => [r.market_id, r.total]),
  );

  return rows.map((r) => {
    const stake = fromCents(r.stake);
    let payout: number;
    let state: PortfolioState;
    if (r.status === 'open') {
      // If it won now: this stake's share of its outcome's pool, times the whole pot.
      payout = fromCents((r.stake / r.pool) * r.pot);
      state = 'active';
    } else if (r.status === 'cancelled' || !r.winner_pool) {
      // Cancelled, or nobody backed the winner: every stake was refunded.
      payout = stake;
      state = 'refunded';
    } else if (r.resolved_outcome_id === r.outcome_id) {
      payout = fromCents(paid.get(r.market_id) ?? 0);
      state = 'won';
    } else {
      payout = 0;
      state = 'lost';
    }
    return {
      market: {
        id: r.market_id,
        question: r.question,
        status: derivedStatus(r, now),
        closeAt: r.close_at,
        isBinary: r.outcome_count === 2,
        resolvedOutcomeId: r.resolved_outcome_id,
      },
      outcomeId: r.outcome_id,
      outcomeLabel: r.label,
      stake,
      payout: round2(payout),
      pnl: state === 'active' ? null : round2(payout - stake),
      state,
    };
  });
}

export function userLedger(db: DB, userId: number, opts: { before?: number; limit?: number } = {}): LedgerEntry[] {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const rows = db
    .prepare(
      `SELECT l.*, m.question FROM ledger l LEFT JOIN markets m ON m.id = l.market_id
        WHERE l.user_id = ? AND l.id < ? ORDER BY l.id DESC LIMIT ?`,
    )
    .all(userId, opts.before ?? Number.MAX_SAFE_INTEGER, limit) as {
    id: number;
    kind: LedgerKind;
    amount: number;
    balance_after: number;
    market_id: number | null;
    question: string | null;
    note: string | null;
    created_at: number;
  }[];
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    amount: fromCents(r.amount),
    balanceAfter: fromCents(r.balance_after),
    marketId: r.market_id,
    marketQuestion: r.question,
    note: r.note,
    createdAt: r.created_at,
  }));
}

export function siteStats(db: DB, now: number): SiteStats {
  const row = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM markets WHERE status = 'open' AND close_at > ?) AS open_markets,
         (SELECT COALESCE(SUM(pot), 0) FROM markets)                          AS total_staked,
         (SELECT COUNT(DISTINCT user_id) FROM bets)                            AS bettors,
         (SELECT COUNT(*) FROM users)                                          AS users`,
    )
    .get(now) as { open_markets: number; total_staked: number; bettors: number; users: number };
  return {
    openMarkets: row.open_markets,
    totalStaked: fromCents(row.total_staked),
    bettors: row.bettors,
    users: row.users,
  };
}
