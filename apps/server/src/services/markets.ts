import {
  fromCents,
  lmsrInitialShares,
  lmsrPrices,
  type CreateMarketInput,
  type MarketDetail,
  type MarketStatus,
  type MarketSummary,
  type Outcome,
  type PricePoint,
} from '@watercooler/shared';
import { placeholders, type DB } from '../db';
import { badRequest, notFound } from '../lib/http';
import { DAY, MINUTE } from '../lib/time';
import { toUserRef } from './users';

export interface MarketRow {
  id: number;
  question: string;
  description: string;
  category: string;
  creator_id: number;
  liquidity: number;
  status: 'open' | 'resolved' | 'cancelled';
  close_at: number;
  resolved_outcome_id: number | null;
  resolved_at: number | null;
  resolved_by: number | null;
  resolution_note: string | null;
  volume: number;
  created_at: number;
}

export interface OutcomeRow {
  id: number;
  market_id: number;
  idx: number;
  label: string;
  shares: number;
}

interface MarketListRow extends MarketRow {
  creator_username: string;
  creator_display_name: string;
  trader_count: number;
  comment_count: number;
  volume_24h: number;
}

export function derivedStatus(m: Pick<MarketRow, 'status' | 'close_at'>, now: number): MarketStatus {
  return m.status === 'open' && m.close_at <= now ? 'closed' : m.status;
}

/** Trading is allowed only while a market is open and before its close time. */
export function isTradable(m: Pick<MarketRow, 'status' | 'close_at'>, now: number): boolean {
  return derivedStatus(m, now) === 'open';
}

export function getMarketRow(db: DB, id: number): MarketRow {
  const row = db.prepare('SELECT * FROM markets WHERE id = ?').get(id) as MarketRow | undefined;
  if (!row) throw notFound('市场不存在');
  return row;
}

export function getOutcomeRows(db: DB, marketId: number): OutcomeRow[] {
  return db.prepare('SELECT * FROM outcomes WHERE market_id = ? ORDER BY idx').all(marketId) as OutcomeRow[];
}

/** Current probabilities; resolved markets are pinned to 1 for the winner. */
export function marketProbabilities(
  market: Pick<MarketRow, 'status' | 'resolved_outcome_id' | 'liquidity'>,
  outcomes: OutcomeRow[],
): number[] {
  if (market.status === 'resolved') return outcomes.map((o) => (o.id === market.resolved_outcome_id ? 1 : 0));
  return lmsrPrices(
    outcomes.map((o) => o.shares),
    market.liquidity,
  );
}

const LIST_SELECT = `
  SELECT m.*,
         u.username     AS creator_username,
         u.display_name AS creator_display_name,
         (SELECT COUNT(DISTINCT t.user_id) FROM trades t WHERE t.market_id = m.id) AS trader_count,
         (SELECT COUNT(*) FROM comments c WHERE c.market_id = m.id)                AS comment_count,
         (SELECT COALESCE(SUM(t.amount), 0) FROM trades t
           WHERE t.market_id = m.id AND t.created_at > @since)                     AS volume_24h
    FROM markets m
    JOIN users u ON u.id = m.creator_id`;

/** Hydrate market rows with outcomes, probabilities and 24h change. */
function hydrate(db: DB, rows: MarketListRow[], now: number): MarketSummary[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const outcomeRows = db
    .prepare(`SELECT * FROM outcomes WHERE market_id IN (${placeholders(ids)}) ORDER BY market_id, idx`)
    .all(...ids) as OutcomeRow[];
  const byMarket = new Map<number, OutcomeRow[]>();
  for (const o of outcomeRows) {
    const list = byMarket.get(o.market_id) ?? [];
    list.push(o);
    byMarket.set(o.market_id, list);
  }

  const prev = snapshotsAt(db, ids, now - DAY);
  const sparkIds = rows.filter((r) => r.status === 'open' && byMarket.get(r.id)?.length === 2).map((r) => r.id);
  const sparks = sparklines(
    db,
    rows.filter((r) => sparkIds.includes(r.id)),
    now,
  );

  return rows.map((r) => {
    const outs = byMarket.get(r.id) ?? [];
    const probs = marketProbabilities(r, outs);
    const before = prev.get(r.id);
    const outcomes: Outcome[] = outs.map((o, i) => ({
      id: o.id,
      index: o.idx,
      label: o.label,
      shares: o.shares,
      probability: probs[i] ?? 0,
      change24h: before?.[i] !== undefined && r.status === 'open' ? (probs[i] ?? 0) - before[i]! : null,
    }));
    return {
      id: r.id,
      question: r.question,
      category: r.category,
      status: derivedStatus(r, now),
      isBinary: outcomes.length === 2,
      liquidity: r.liquidity,
      volume: fromCents(r.volume),
      closeAt: r.close_at,
      createdAt: r.created_at,
      resolvedOutcomeId: r.resolved_outcome_id,
      traderCount: r.trader_count,
      commentCount: r.comment_count,
      creator: toUserRef({ id: r.creator_id, username: r.creator_username, display_name: r.creator_display_name }),
      outcomes,
      spark: sparks.get(r.id) ?? [],
    };
  });
}

/** Latest price snapshot at or before `t`, per market. */
function snapshotsAt(db: DB, ids: number[], t: number): Map<number, number[]> {
  const rows = db
    .prepare(
      `SELECT market_id, probs FROM price_history WHERE id IN (
         SELECT MAX(id) FROM price_history
          WHERE market_id IN (${placeholders(ids)}) AND created_at <= ?
          GROUP BY market_id)`,
    )
    .all(...ids, t) as { market_id: number; probs: string }[];
  return new Map(rows.map((r) => [r.market_id, JSON.parse(r.probs) as number[]]));
}

const SPARK_WINDOW = 7 * DAY;
const SPARK_POINTS = 32;

/** First-outcome probability sampled at evenly spaced times over the last week. */
function sparklines(
  db: DB,
  markets: Pick<MarketRow, 'id' | 'created_at' | 'close_at'>[],
  now: number,
): Map<number, number[]> {
  const result = new Map<number, number[]>();
  if (markets.length === 0) return result;
  const ids = markets.map((m) => m.id);
  const since = now - SPARK_WINDOW;
  const before = snapshotsAt(db, ids, since);
  const rows = db
    .prepare(
      `SELECT market_id, probs, created_at FROM price_history
        WHERE market_id IN (${placeholders(ids)}) AND created_at > ? ORDER BY id`,
    )
    .all(...ids, since) as { market_id: number; probs: string; created_at: number }[];
  const series = new Map<number, { t: number; p: number }[]>();
  for (const r of rows) {
    const list = series.get(r.market_id) ?? [];
    list.push({ t: r.created_at, p: (JSON.parse(r.probs) as number[])[0] ?? 0 });
    series.set(r.market_id, list);
  }
  for (const m of markets) {
    const points = series.get(m.id) ?? [];
    const start = Math.max(m.created_at, since);
    const end = Math.min(now, m.close_at);
    let value = before.get(m.id)?.[0] ?? points[0]?.p ?? 0.5;
    let j = 0;
    const out: number[] = [];
    for (let k = 0; k < SPARK_POINTS; k++) {
      const t = start + ((end - start) * k) / (SPARK_POINTS - 1);
      while (j < points.length && points[j]!.t <= t) value = points[j++]!.p;
      out.push(Math.round(value * 1000) / 1000);
    }
    result.set(m.id, out);
  }
  return result;
}

export type MarketFilter = 'active' | 'closed' | 'resolved' | 'all';
export type MarketSort = 'trending' | 'volume' | 'new' | 'closing';

export interface ListMarketsOptions {
  filter?: MarketFilter;
  sort?: MarketSort;
  category?: string;
  search?: string;
  creatorId?: number;
  limit?: number;
}

export function listMarkets(db: DB, now: number, opts: ListMarketsOptions = {}): MarketSummary[] {
  const where: string[] = [];
  const params: Record<string, unknown> = { now, since: now - DAY };
  switch (opts.filter ?? 'active') {
    case 'active':
      where.push(`m.status = 'open' AND m.close_at > @now`);
      break;
    case 'closed':
      where.push(`m.status = 'open' AND m.close_at <= @now`);
      break;
    case 'resolved':
      where.push(`m.status IN ('resolved', 'cancelled')`);
      break;
    case 'all':
      break;
  }
  if (opts.category) {
    where.push('m.category = @category');
    params.category = opts.category;
  }
  if (opts.search) {
    where.push(`(m.question LIKE @search ESCAPE '\\' OR m.description LIKE @search ESCAPE '\\')`);
    params.search = `%${opts.search.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  }
  if (opts.creatorId !== undefined) {
    where.push('m.creator_id = @creatorId');
    params.creatorId = opts.creatorId;
  }
  const order = {
    trending: 'volume_24h DESC, m.volume DESC, m.id DESC',
    volume: 'm.volume DESC, m.id DESC',
    new: 'm.id DESC',
    closing: 'm.close_at ASC, m.id DESC',
  }[opts.sort ?? 'trending'];
  params.limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);

  const rows = db
    .prepare(`${LIST_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order} LIMIT @limit`)
    .all(params) as MarketListRow[];
  return hydrate(db, rows, now);
}

export function getMarketSummary(db: DB, id: number, now: number): MarketSummary {
  const row = db.prepare(`${LIST_SELECT} WHERE m.id = @id`).get({ id, since: now - DAY }) as MarketListRow | undefined;
  if (!row) throw notFound('市场不存在');
  return hydrate(db, [row], now)[0]!;
}

export function getMarketDetail(db: DB, id: number, now: number): MarketDetail {
  const summary = getMarketSummary(db, id, now);
  const row = getMarketRow(db, id);
  const resolver = row.resolved_by
    ? (db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(row.resolved_by) as
        { id: number; username: string; display_name: string } | undefined)
    : undefined;
  return {
    ...summary,
    description: row.description,
    resolvedAt: row.resolved_at,
    resolutionNote: row.resolution_note,
    resolvedBy: resolver ? toUserRef(resolver) : null,
  };
}

export function recordPriceSnapshot(db: DB, marketId: number, probs: number[], now: number): void {
  const rounded = probs.map((p) => Math.round(p * 1e6) / 1e6);
  db.prepare('INSERT INTO price_history (market_id, probs, created_at) VALUES (?, ?, ?)').run(
    marketId,
    JSON.stringify(rounded),
    now,
  );
}

export function createMarket(db: DB, creatorId: number, input: CreateMarketInput, now: number): number {
  const liquidity = input.liquidity ?? 300;
  if (input.closeAt <= now + 5 * MINUTE) throw badRequest('截止时间至少要在 5 分钟之后');
  if (input.closeAt > now + 5 * 365 * DAY) throw badRequest('截止时间不能超过 5 年');
  const n = input.outcomes.length;
  const initialProbs =
    input.initialProbability !== undefined
      ? [input.initialProbability, 1 - input.initialProbability]
      : Array.from({ length: n }, () => 1 / n);
  const shares = lmsrInitialShares(initialProbs, liquidity);

  return db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO markets (question, description, category, creator_id, liquidity, close_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(input.question, input.description ?? '', input.category, creatorId, liquidity, input.closeAt, now);
    const marketId = Number(lastInsertRowid);
    const insertOutcome = db.prepare('INSERT INTO outcomes (market_id, idx, label, shares) VALUES (?, ?, ?, ?)');
    input.outcomes.forEach((label, i) => insertOutcome.run(marketId, i, label, shares[i]));
    recordPriceSnapshot(db, marketId, lmsrPrices(shares, liquidity), now);
    return marketId;
  })();
}

export type HistoryRange = '1d' | '1w' | '1m' | 'all';

/** Price history, downsampled to at most `maxPoints` and always ending at `now`. */
export function getPriceHistory(
  db: DB,
  marketId: number,
  range: HistoryRange,
  now: number,
  maxPoints = 300,
): PricePoint[] {
  const market = getMarketRow(db, marketId);
  const since = { '1d': now - DAY, '1w': now - 7 * DAY, '1m': now - 30 * DAY, all: 0 }[range];
  const rows = db
    .prepare('SELECT probs, created_at FROM price_history WHERE market_id = ? AND created_at >= ? ORDER BY id')
    .all(marketId, since) as { probs: string; created_at: number }[];
  // Carry in the last value before the window so the line starts at the left edge.
  const before = db
    .prepare('SELECT probs FROM price_history WHERE market_id = ? AND created_at < ? ORDER BY id DESC LIMIT 1')
    .get(marketId, since) as { probs: string } | undefined;

  let points: PricePoint[] = rows.map((r) => ({ t: r.created_at, probs: JSON.parse(r.probs) as number[] }));
  if (before) points.unshift({ t: since, probs: JSON.parse(before.probs) as number[] });

  if (points.length > maxPoints) {
    // Keep the last point of each time bucket.
    const start = points[0]!.t;
    const span = Math.max(points[points.length - 1]!.t - start, 1);
    const buckets = new Map<number, PricePoint>();
    for (const p of points) buckets.set(Math.floor(((p.t - start) / span) * (maxPoints - 1)), p);
    points = [...buckets.values()];
  }

  const last = points[points.length - 1];
  const end = market.status === 'open' ? Math.min(now, market.close_at) : (market.resolved_at ?? now);
  if (last && last.t < end) points.push({ t: end, probs: last.probs });
  return points;
}
