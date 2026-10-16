import {
  fromCents,
  lmsrPrices,
  round2,
  SHARE_EPSILON,
  type LeaderboardEntry,
  type LedgerEntry,
  type LedgerKind,
  type PortfolioPosition,
  type PortfolioPositionState,
  type SiteStats,
  type UserStats,
} from '@watercooler/shared';
import type { DB } from '../db';
import { derivedStatus, type MarketRow } from './markets';
import { toUserRef } from './users';

/** outcome id -> current price, for every market that is still open. */
function openOutcomePrices(db: DB): Map<number, number> {
  const rows = db
    .prepare(
      `SELECT o.id, o.market_id, o.shares, m.liquidity
         FROM outcomes o JOIN markets m ON m.id = o.market_id
        WHERE m.status = 'open'
        ORDER BY o.market_id, o.idx`,
    )
    .all() as { id: number; market_id: number; shares: number; liquidity: number }[];
  const prices = new Map<number, number>();
  let i = 0;
  while (i < rows.length) {
    let j = i;
    while (j < rows.length && rows[j]!.market_id === rows[i]!.market_id) j++;
    const group = rows.slice(i, j);
    const p = lmsrPrices(
      group.map((r) => r.shares),
      group[0]!.liquidity,
    );
    group.forEach((r, k) => prices.set(r.id, p[k]!));
    i = j;
  }
  return prices;
}

/** Stats for every user at once (cheap enough for an office-sized crowd). */
export function computeAllStats(db: DB): Map<number, UserStats> {
  const prices = openOutcomePrices(db);
  const users = db.prepare('SELECT id, balance FROM users').all() as { id: number; balance: number }[];
  const stats = new Map<number, UserStats>();
  for (const u of users) {
    stats.set(u.id, {
      balance: fromCents(u.balance),
      positionsValue: 0,
      netWorth: 0,
      funded: 0,
      profit: 0,
      tradeCount: 0,
      marketsTraded: 0,
    });
  }

  const positions = db
    .prepare('SELECT user_id, outcome_id, shares FROM positions WHERE shares > ?')
    .all(SHARE_EPSILON) as { user_id: number; outcome_id: number; shares: number }[];
  for (const p of positions) {
    const price = prices.get(p.outcome_id);
    const s = stats.get(p.user_id);
    if (price !== undefined && s) s.positionsValue += p.shares * price;
  }

  const funded = db
    .prepare(
      `SELECT user_id, SUM(amount) AS total FROM ledger WHERE kind IN ('signup', 'bonus', 'grant') GROUP BY user_id`,
    )
    .all() as { user_id: number; total: number }[];
  for (const f of funded) {
    const s = stats.get(f.user_id);
    if (s) s.funded = fromCents(f.total);
  }

  const activity = db
    .prepare('SELECT user_id, COUNT(*) AS trades, COUNT(DISTINCT market_id) AS markets FROM trades GROUP BY user_id')
    .all() as { user_id: number; trades: number; markets: number }[];
  for (const a of activity) {
    const s = stats.get(a.user_id);
    if (s) {
      s.tradeCount = a.trades;
      s.marketsTraded = a.markets;
    }
  }

  for (const s of stats.values()) {
    s.positionsValue = round2(s.positionsValue);
    s.netWorth = round2(s.balance + s.positionsValue);
    s.profit = round2(s.netWorth - s.funded);
  }
  return stats;
}

export type LeaderboardSort = 'profit' | 'netWorth' | 'volume';

export function leaderboard(db: DB, sort: LeaderboardSort = 'profit'): LeaderboardEntry[] {
  const stats = computeAllStats(db);
  const users = db.prepare('SELECT id, username, display_name FROM users').all() as {
    id: number;
    username: string;
    display_name: string;
  }[];
  const key = (s: UserStats) => (sort === 'netWorth' ? s.netWorth : sort === 'volume' ? s.tradeCount : s.profit);
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

/** All positions of a user, live ones first, with valuation and P&L. */
export function userPositions(db: DB, userId: number, now: number): PortfolioPosition[] {
  const rows = db
    .prepare(
      `SELECT p.outcome_id, p.shares, p.cost, o.label, o.market_id,
              m.question, m.status, m.close_at, m.resolved_outcome_id, m.liquidity,
              (SELECT COUNT(*) FROM outcomes x WHERE x.market_id = m.id) AS outcome_count
         FROM positions p
         JOIN outcomes o ON o.id = p.outcome_id
         JOIN markets m  ON m.id = p.market_id
        WHERE p.user_id = ? AND p.shares > ?
        ORDER BY (m.status = 'open') DESC, m.close_at ASC`,
    )
    .all(userId, SHARE_EPSILON) as {
    outcome_id: number;
    shares: number;
    cost: number;
    label: string;
    market_id: number;
    question: string;
    status: MarketRow['status'];
    close_at: number;
    resolved_outcome_id: number | null;
    liquidity: number;
    outcome_count: number;
  }[];
  const prices = openOutcomePrices(db);

  return rows.map((r) => {
    const cost = fromCents(r.cost);
    let price: number;
    let value: number;
    let state: PortfolioPositionState;
    if (r.status === 'resolved') {
      const won = r.resolved_outcome_id === r.outcome_id;
      price = won ? 1 : 0;
      value = won ? r.shares : 0;
      state = won ? 'won' : 'lost';
    } else if (r.status === 'cancelled') {
      price = r.shares > 0 ? cost / r.shares : 0;
      value = cost;
      state = 'refunded';
    } else {
      price = prices.get(r.outcome_id) ?? 0;
      value = r.shares * price;
      state = 'active';
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
      shares: r.shares,
      cost,
      avgPrice: r.shares > 0 ? cost / r.shares : 0,
      price,
      value: round2(value),
      pnl: round2(value - cost),
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
         (SELECT COALESCE(SUM(volume), 0) FROM markets)                       AS total_volume,
         (SELECT COUNT(DISTINCT user_id) FROM trades)                          AS traders,
         (SELECT COUNT(*) FROM users)                                          AS users`,
    )
    .get(now) as { open_markets: number; total_volume: number; traders: number; users: number };
  return {
    openMarkets: row.open_markets,
    totalVolume: fromCents(row.total_volume),
    traders: row.traders,
    users: row.users,
  };
}
