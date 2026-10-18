import type Anthropic from '@anthropic-ai/sdk';
import {
  CATEGORIES,
  createMarketSchema,
  CURRENCY_NAME,
  fromCents,
  MAX_BET,
  MAX_OUTCOMES,
  MIN_BET,
  payoutMultiplier,
  previewBet,
  toCents,
  type MarketSummary,
} from '@watercooler/shared';
import type { Config } from '../config';
import type { DB } from '../db';
import { HttpError } from '../lib/http';
import { DAY, MINUTE } from '../lib/time';
import { getUserStakes } from '../services/bets';
import {
  derivedStatus,
  getMarketDetail,
  getMarketRow,
  getOutcomeRows,
  isBettable,
  listMarkets,
  type MarketFilter,
  type MarketSort,
  type MarketRow,
  type OutcomeRow,
} from '../services/markets';
import { leaderboard, userBets, userStatsAndRank, type LeaderboardSort } from '../services/stats';
import { claimDailyBonus, getUserById, toMe } from '../services/users';
import { confirmationCard, createAction, type ActionPayload, type CardText } from './actions';
import type { Card } from './transport';

export interface ToolContext {
  db: DB;
  config: Config;
  now: number;
  siteUrl: string;
  userId: number;
  wecomUserId: string;
  /** The confirmation card this message will carry; one per message. */
  card: Card | null;
}

/** An error the model should see and explain (or fix and retry). */
class ToolError extends Error {}

export const formatTime = (t: number, timeZone: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(t);

const pct = (p: number) => `${Math.round(p * 1000) / 10}%`;
const money = (n: number) => Math.round(n * 100) / 100;
export const marketUrl = (siteUrl: string, id: number) => `${siteUrl}/market/${id}`;

const STATUS_LABEL = { open: '可下注', closed: '已截止待公布', resolved: '已公布', cancelled: '已取消' } as const;

function compactMarket(ctx: ToolContext, m: MarketSummary) {
  return {
    id: m.id,
    mode: m.mode,
    question: m.question,
    status: STATUS_LABEL[m.status],
    zone: m.isAi ? 'AI 专区' : '大家的盘',
    category: m.category,
    closeAt: formatTime(m.closeAt, ctx.config.timezone),
    pot: m.pot,
    bettors: m.bettorCount,
    creator: m.creator.displayName,
    outcomes: m.outcomes.map((o) => ({
      label: o.label,
      probability: pct(o.probability),
      pool: o.pool,
      ...(m.resolvedOutcomeId === o.id ? { winner: true } : {}),
    })),
  };
}

function findMarket(db: DB, id: unknown): MarketRow {
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n <= 0) throw new ToolError('marketId 无效');
  try {
    return getMarketRow(db, n);
  } catch {
    throw new ToolError(`没有 id 为 ${n} 的市场`);
  }
}

/** Match an option by its label (case and surrounding spaces ignored) or by its 1-based number. */
function findOutcome(outcomes: OutcomeRow[], wanted: unknown): OutcomeRow {
  const text = String(wanted ?? '').trim();
  const byLabel = outcomes.find((o) => o.label.trim().toLowerCase() === text.toLowerCase());
  if (byLabel) return byLabel;
  const n = Number(text);
  if (Number.isInteger(n) && n >= 1 && n <= outcomes.length) return outcomes[n - 1]!;
  throw new ToolError(`没有这个选项。可选：${outcomes.map((o) => `「${o.label}」`).join('、')}`);
}

function propose(ctx: ToolContext, payload: ActionPayload, text: CardText): string {
  if (ctx.card) throw new ToolError('这条消息已经有一个待确认的操作了，一次只能确认一个，请让用户先处理那一个');
  const action = createAction(ctx.db, ctx.userId, ctx.wecomUserId, payload, ctx.now);
  ctx.card = confirmationCard(action, text);
  return '已经给用户发了确认卡片，用户点「确认」后才会执行（10 分钟内有效）。告诉用户点卡片确认即可，不要说已经完成。';
}

type Input = Record<string, unknown>;

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

interface ToolDef {
  tool: Anthropic.Beta.BetaTool;
  run: (ctx: ToolContext, input: Input) => unknown;
}

const tools: ToolDef[] = [
  {
    tool: {
      name: 'list_markets',
      description: '列出市场（预测题）。默认列出大家建的、正在下注的盘。',
      input_schema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['active', 'closed', 'resolved'],
            description: 'active 可下注；closed 已截止待公布；resolved 已公布或已取消',
          },
          zone: { type: 'string', enum: ['human', 'ai', 'all'], description: 'human 大家建的盘；ai AI 专区' },
          sort: { type: 'string', enum: ['trending', 'pot', 'new', 'closing'] },
          search: { type: 'string', description: '按问题关键词搜索' },
          limit: { type: 'integer', minimum: 1, maximum: 20 },
        },
      },
    },
    run: (ctx, input) => {
      const zone = input.zone === 'ai' ? 'ai' : input.zone === 'all' ? 'any' : 'human';
      const markets = listMarkets(ctx.db, ctx.now, {
        filter: oneOf<MarketFilter>(input.status, ['active', 'closed', 'resolved'], 'active'),
        zone,
        sort: oneOf<MarketSort>(input.sort, ['trending', 'pot', 'new', 'closing'], 'trending'),
        search: typeof input.search === 'string' && input.search.trim() ? input.search.trim() : undefined,
        limit: Math.min(Math.max(Number(input.limit) || 10, 1), 20),
      });
      return markets.map((m) => compactMarket(ctx, m));
    },
  },
  {
    tool: {
      name: 'get_market',
      description: '查看一个市场的详情：规则说明、各选项奖池和赔率、用户自己的押注、链接。',
      input_schema: {
        type: 'object',
        properties: { marketId: { type: 'integer' } },
        required: ['marketId'],
      },
    },
    run: (ctx, input) => {
      const row = findMarket(ctx.db, input.marketId);
      const m = getMarketDetail(ctx.db, row.id, ctx.now);
      if (m.mode === 'polymarket')
        return {
          ...compactMarket(ctx, m),
          description: m.description.slice(0, 1500),
          settleAt: formatTime(m.settleAt, ctx.config.timezone),
          trading: 'Polymarket 使用份额订单簿，请到网站查看盘口和交易；未公布结果时不会自动取消。',
          url: marketUrl(ctx.siteUrl, m.id),
        };
      const pools = m.outcomes.map((o) => o.pool);
      const stakes = getUserStakes(ctx.db, ctx.userId, m.id);
      return {
        ...compactMarket(ctx, m),
        description: m.description.slice(0, 1500),
        outcomes: m.outcomes.map((o, i) => {
          const multiplier = payoutMultiplier(pools, i);
          return {
            label: o.label,
            probability: pct(o.probability),
            pool: o.pool,
            payoutPerUnit: multiplier === null ? '还没人押，押中可拿走整个奖池' : money(multiplier),
            myStake: stakes.find((s) => s.outcomeId === o.id)?.amount ?? 0,
            ...(m.resolvedOutcomeId === o.id ? { winner: true } : {}),
          };
        }),
        createdByMe: m.creator.id === ctx.userId,
        settleAt: formatTime(m.settleAt, ctx.config.timezone),
        autoCancelAt: formatTime(m.resolveBy!, ctx.config.timezone),
        resolutionNote: m.resolutionNote,
        url: marketUrl(ctx.siteUrl, m.id),
      };
    },
  },
  {
    tool: {
      name: 'my_account',
      description: '用户自己的账户：余额、能否签到、盈亏和排名、进行中的押注、自己建的待公布的盘。',
      input_schema: { type: 'object', properties: {} },
    },
    run: (ctx) => {
      const user = getUserById(ctx.db, ctx.userId)!;
      const me = toMe(user, ctx.config, ctx.now);
      const { stats, rank } = userStatsAndRank(ctx.db, ctx.userId);
      const bets = userBets(ctx.db, ctx.userId, ctx.now);
      const toResolve = listMarkets(ctx.db, ctx.now, {
        filter: 'closed',
        zone: 'any',
        creatorId: ctx.userId,
        sort: 'closing',
        limit: 10,
      });
      return {
        name: me.displayName,
        username: me.username,
        balance: me.balance,
        canClaimDailyBonus: me.canClaimBonus,
        netWorth: stats.netWorth,
        profit: stats.profit,
        rank,
        activeBets: bets
          .filter((b) => b.state === 'active')
          .slice(0, 15)
          .map((b) => ({
            marketId: b.market.id,
            question: b.market.question,
            outcome: b.outcomeLabel,
            stake: b.stake,
            payoutIfWins: money(b.payout),
          })),
        recentlySettled: bets
          .filter((b) => b.state !== 'active')
          .slice(0, 5)
          .map((b) => ({ question: b.market.question, outcome: b.outcomeLabel, result: b.state, pnl: b.pnl })),
        myMarketsToResolve: toResolve.map((m) => ({ id: m.id, question: m.question })),
      };
    },
  },
  {
    tool: {
      name: 'leaderboard',
      description: '排行榜（只有人，不含 AI 机器人）。',
      input_schema: {
        type: 'object',
        properties: {
          sort: { type: 'string', enum: ['profit', 'netWorth', 'bets'], description: '盈利、总资产或下注次数' },
          limit: { type: 'integer', minimum: 1, maximum: 20 },
        },
      },
    },
    run: (ctx, input) => {
      const sort = oneOf<LeaderboardSort>(input.sort, ['profit', 'netWorth', 'bets'], 'profit');
      return leaderboard(ctx.db, sort)
        .slice(0, Math.min(Math.max(Number(input.limit) || 10, 1), 20))
        .map((e) => ({
          rank: e.rank,
          name: e.user.displayName,
          isMe: e.user.id === ctx.userId,
          profit: e.stats.profit,
          netWorth: e.stats.netWorth,
          bets: e.stats.betCount,
        }));
    },
  },
  {
    tool: {
      name: 'claim_daily_bonus',
      description: `领取每日签到奖励（${CURRENCY_NAME}），每天一次，直接到账。`,
      input_schema: { type: 'object', properties: {} },
    },
    run: (ctx) => {
      const balance = claimDailyBonus(ctx.db, ctx.config, ctx.userId, ctx.now);
      return { claimed: ctx.config.dailyBonus, balance: fromCents(balance) };
    },
  },
  {
    tool: {
      name: 'place_bet',
      description: '给用户下注。不会马上执行：会发一张确认卡片，用户点确认才扣钱。',
      input_schema: {
        type: 'object',
        properties: {
          marketId: { type: 'integer' },
          outcome: { type: 'string', description: '选项名称，和市场里的选项一致' },
          amount: { type: 'number', minimum: MIN_BET, maximum: MAX_BET, description: `金额（${CURRENCY_NAME}）` },
        },
        required: ['marketId', 'outcome', 'amount'],
      },
    },
    run: (ctx, input) => {
      const market = findMarket(ctx.db, input.marketId);
      if (market.mode !== 'pool')
        throw new ToolError(`Polymarket 使用份额订单，请到网站交易：${marketUrl(ctx.siteUrl, market.id)}`);
      if (!isBettable(market, ctx.now)) throw new ToolError('这个市场已经停止下注了');
      const outcomes = getOutcomeRows(ctx.db, market.id);
      const outcome = findOutcome(outcomes, input.outcome);
      const amount = Number(input.amount);
      if (!Number.isFinite(amount) || amount < MIN_BET || amount > MAX_BET) {
        throw new ToolError(`金额要在 ${MIN_BET} 到 ${MAX_BET} 之间`);
      }
      const cents = toCents(amount);
      const user = getUserById(ctx.db, ctx.userId)!;
      if (cents > user.balance)
        throw new ToolError(`余额不足：用户现在只有 ${fromCents(user.balance)} ${CURRENCY_NAME}`);
      const pools = outcomes.map((o) => fromCents(o.pool));
      const idx = outcomes.indexOf(outcome);
      const stake = getUserStakes(ctx.db, ctx.userId, market.id).find((s) => s.outcomeId === outcome.id)?.amount ?? 0;
      const preview = previewBet(pools, idx, fromCents(cents), stake);
      return propose(
        ctx,
        { kind: 'bet', marketId: market.id, outcomeId: outcome.id, amount: fromCents(cents) },
        {
          title: `确认下注 ${fromCents(cents)} ${CURRENCY_NAME}`,
          desc: market.question,
          rows: [
            ['选项', outcome.label],
            ['金额', `${fromCents(cents)} ${CURRENCY_NAME}`],
            ['押中可得', `约 ${money(preview.payout)}（按当前奖池）`],
            ['截止', formatTime(market.close_at, ctx.config.timezone)],
          ],
          note:
            stake > 0 ? `你在这个选项上已经押了 ${stake}，确认后合计 ${money(stake + fromCents(cents))}` : undefined,
          url: marketUrl(ctx.siteUrl, market.id),
        },
      );
    },
  },
  {
    tool: {
      name: 'create_market',
      description: '以用户的名义开一个新盘（预测题）。不会马上执行：会发确认卡片，用户确认后才创建。',
      input_schema: {
        type: 'object',
        properties: {
          question: { type: 'string', description: '问题，5-200 字，要有明确的判定标准' },
          description: { type: 'string', description: '规则说明：怎么判定、以什么为准' },
          category: { type: 'string', enum: [...CATEGORIES] },
          closeAt: {
            type: 'string',
            description: '截止下注时间，ISO 8601 并带时区，如 2026-10-20T18:00:00+08:00',
          },
          outcomes: {
            type: 'array',
            items: { type: 'string' },
            minItems: 2,
            maxItems: MAX_OUTCOMES,
            description: '选项；是非题用 ["是", "否"]',
          },
        },
        required: ['question', 'category', 'closeAt', 'outcomes'],
      },
    },
    run: (ctx, input) => {
      const closeText = String(input.closeAt ?? '');
      if (!/(z|[+-]\d{2}:?\d{2})$/i.test(closeText)) throw new ToolError('closeAt 要带时区，例如 +08:00');
      const closeAt = Date.parse(closeText);
      if (!Number.isFinite(closeAt)) throw new ToolError('closeAt 不是有效的时间');
      if (closeAt <= ctx.now + 5 * MINUTE) throw new ToolError('截止时间至少要在 5 分钟之后');
      if (closeAt > ctx.now + 5 * 365 * DAY) throw new ToolError('截止时间不能超过 5 年');
      const parsed = createMarketSchema.safeParse({
        question: input.question,
        description: input.description ?? '',
        category: input.category,
        closeAt,
        outcomes: input.outcomes,
      });
      if (!parsed.success) throw new ToolError(parsed.error.issues[0]?.message ?? '参数不对');
      const m = parsed.data;
      if (!(CATEGORIES as readonly string[]).includes(m.category)) {
        throw new ToolError(`分类只能是：${CATEGORIES.join('、')}`);
      }
      return propose(
        ctx,
        { kind: 'create', input: m },
        {
          title: '确认开盘',
          desc: m.question,
          rows: [
            ['选项', m.outcomes.join(' / ')],
            ['分类', m.category],
            ['截止', formatTime(m.closeAt, ctx.config.timezone)],
          ],
          note: m.description || '截止后由你公布结果',
        },
      );
    },
  },
  {
    tool: {
      name: 'resolve_market',
      description:
        '公布用户自己创建的市场的结果并结算（押中的人按比例分走整个奖池）。不会马上执行：会发确认卡片，用户确认后才结算，结算后不能撤销。',
      input_schema: {
        type: 'object',
        properties: {
          marketId: { type: 'integer' },
          outcome: { type: 'string', description: '胜出的选项名称' },
          note: { type: 'string', description: '结果说明或依据，可选' },
        },
        required: ['marketId', 'outcome'],
      },
    },
    run: (ctx, input) => {
      const market = findMarket(ctx.db, input.marketId);
      if (market.creator_id !== ctx.userId) throw new ToolError('只有市场创建者可以公布结果，这个盘不是用户建的');
      if (market.status !== 'open') throw new ToolError('这个市场已经结算或取消了');
      const outcomes = getOutcomeRows(ctx.db, market.id);
      const outcome = findOutcome(outcomes, input.outcome);
      const winners = (
        ctx.db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM bets WHERE outcome_id = ?').get(outcome.id) as {
          n: number;
        }
      ).n;
      const early = derivedStatus(market, ctx.now) === 'open';
      const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 1000) : undefined;
      return propose(
        ctx,
        { kind: 'resolve', marketId: market.id, outcomeId: outcome.id, note },
        {
          title: `确认结果：${outcome.label}`,
          desc: market.question,
          rows: [
            ['结果', outcome.label],
            ['奖池', `${fromCents(market.pot)} ${CURRENCY_NAME}`],
            ['押中人数', winners > 0 ? String(winners) : '没人押中，全部退还'],
          ],
          note: `${early ? '还没到截止时间，确认后提前结束下注并结算。' : ''}结算后不能撤销。${note ? `说明：${note}` : ''}`,
          url: marketUrl(ctx.siteUrl, market.id),
        },
      );
    },
  },
  {
    tool: {
      name: 'cancel_market',
      description: '取消用户自己创建的市场，所有押注全额退还。不会马上执行：会发确认卡片，用户确认后才取消。',
      input_schema: {
        type: 'object',
        properties: {
          marketId: { type: 'integer' },
          note: { type: 'string', description: '取消原因，可选' },
        },
        required: ['marketId'],
      },
    },
    run: (ctx, input) => {
      const market = findMarket(ctx.db, input.marketId);
      if (market.creator_id !== ctx.userId) throw new ToolError('只有市场创建者可以取消，这个盘不是用户建的');
      if (market.status !== 'open') throw new ToolError('这个市场已经结算或取消了');
      const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 1000) : undefined;
      return propose(
        ctx,
        { kind: 'cancel', marketId: market.id, note },
        {
          title: '确认取消市场',
          desc: market.question,
          rows: [['奖池', `${fromCents(market.pot)} ${CURRENCY_NAME}，全部退还`]],
          note: note ? `原因：${note}` : '取消后不能恢复',
          url: marketUrl(ctx.siteUrl, market.id),
        },
      );
    },
  },
];

export const chatTools: Anthropic.Beta.BetaTool[] = tools.map((t) => t.tool);

/** Run a tool call; failures come back as an error result the model can explain. */
export function runTool(ctx: ToolContext, name: string, input: unknown): { content: string; isError: boolean } {
  const def = tools.find((t) => t.tool.name === name);
  if (!def) return { content: `没有 ${name} 这个工具`, isError: true };
  try {
    const result = def.run(ctx, (input ?? {}) as Input);
    return { content: typeof result === 'string' ? result : JSON.stringify(result), isError: false };
  } catch (err) {
    if (err instanceof ToolError || err instanceof HttpError) return { content: err.message, isError: true };
    throw err;
  }
}

export const RULES = `玩法（奖池制）：每个选项一个奖池，押注进入所选选项的奖池；概率 = 该选项奖池占总奖池的比例。结果公布后，押中的人按押注比例分走整个奖池（包括押错的人的钱）；没人押中就全部退还。网站不抽成也不补贴。市场由创建者自己公布结果或取消，停止交易与结算时间分开设置，到结算时间后可公布；奖池模式在结算时间后 7 天未公布会自动取消并退款；Polymarket 模式保留持仓和抵押资金等待结算，不会自动取消。AI 专区的题由 AI 机器人出题和公布，人可以去押注。`;
