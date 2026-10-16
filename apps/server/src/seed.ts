/**
 * Fill the database with demo users, markets and a few weeks of simulated trading.
 *   pnpm seed            # refuses to touch a database that already has users
 *   pnpm seed --reset    # deletes the database file first
 */
import { existsSync, rmSync } from 'node:fs';
import { SHARE_EPSILON } from '@watercooler/shared';
import { loadConfig, loadDotEnv } from './config';
import { openDatabase } from './db';
import { addComment } from './services/comments';
import { createMarket, getOutcomeRows, marketProbabilities } from './services/markets';
import { cancelMarket, executeTrade, resolveMarket } from './services/trading';
import { createUser } from './services/users';
import { DAY, HOUR } from './lib/time';

loadDotEnv();
const config = loadConfig();
if (process.argv.includes('--reset')) {
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(config.databasePath + suffix)) rmSync(config.databasePath + suffix);
  }
}
const db = openDatabase(config.databasePath);
if ((db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n > 0) {
  console.error('数据库里已经有用户了。如需重建演示数据，请运行: pnpm seed --reset');
  process.exit(1);
}

// Deterministic PRNG so every seed run looks the same.
let state = 20261016;
const rand = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

const now = Date.now();
const start = now - 21 * DAY;

const people = [
  ['admin', '管理员'],
  ['xiaoming', '小明'],
  ['lili', '莉莉'],
  ['dawei', '大伟'],
  ['tingting', '婷婷'],
  ['ajie', '阿杰'],
  ['qiqi', '琪琪'],
  ['laozhang', '老张'],
] as const;

const userIds: number[] = [];
for (const [username, displayName] of people) {
  const user = await createUser(
    db,
    config,
    { username, displayName, password: username === 'admin' ? 'admin123' : 'demo123' },
    start,
  );
  userIds.push(user.id);
}
const adminId = userIds[0]!;
const players = userIds.slice(1);

interface Spec {
  question: string;
  description: string;
  category: string;
  outcomes: string[];
  createdDaysAgo: number;
  closeInDays: number;
  /** Where the "true" probabilities drift towards, steering simulated traders. */
  target: number[];
  trades: number;
  liquidity?: number;
  resolveTo?: number;
  cancel?: boolean;
  comments?: string[];
}

const specs: Spec[] = [
  {
    question: '这周五下午茶会有奶茶吗？',
    description: '以周五 15:00 茶水间实际出现的饮品为准。只要有一杯奶茶就算「是」。',
    category: '公司',
    outcomes: ['是', '否'],
    createdDaysAgo: 4,
    closeInDays: 2,
    target: [0.72, 0.28],
    trades: 70,
    comments: ['上周就是奶茶，这周大概率换咖啡', '行政小姐姐说在比价了', '梭哈「是」'],
  },
  {
    question: '沪深 300 年底收盘能站上 5000 点吗？',
    description: '以 12 月最后一个交易日沪深 300 指数收盘价为准，≥ 5000 即为「是」。',
    category: '行情',
    outcomes: ['是', '否'],
    createdDaysAgo: 20,
    closeInDays: 75,
    target: [0.34, 0.66],
    trades: 90,
    liquidity: 1000,
    comments: ['因子说不行', '这是 alpha 还是 beta？'],
  },
  {
    question: '下次团建去哪儿？',
    description: '以行政最终发出的团建通知为准。如果通知里有多个地点，以第一站为准。',
    category: '公司',
    outcomes: ['千岛湖', '莫干山', '迪士尼', '楼下烧烤'],
    createdDaysAgo: 12,
    closeInDays: 20,
    target: [0.38, 0.3, 0.12, 0.2],
    trades: 60,
    comments: ['楼下烧烤才是永远的神', '千岛湖去过了吧？'],
  },
  {
    question: '本赛季 NBA 总冠军是谁？',
    description: '以 NBA 官方公布的总决赛结果为准。',
    category: '体育',
    outcomes: ['雷霆', '凯尔特人', '掘金', '尼克斯', '其他'],
    createdDaysAgo: 15,
    closeInDays: 200,
    target: [0.32, 0.18, 0.14, 0.16, 0.2],
    trades: 50,
  },
  {
    question: '下周一 9:30 前到公司的人会超过一半吗？',
    description: '以门禁打卡记录为准。',
    category: '公司',
    outcomes: ['是', '否'],
    createdDaysAgo: 2,
    closeInDays: 4,
    target: [0.41, 0.59],
    trades: 25,
    liquidity: 100,
  },
  {
    question: '比特币年底前会突破 15 万美元吗？',
    description: '以年底前任意时刻主流交易所 BTC/USDT 价格触及 150,000 为准。',
    category: '行情',
    outcomes: ['是', '否'],
    createdDaysAgo: 18,
    closeInDays: 76,
    target: [0.22, 0.78],
    trades: 55,
  },
  {
    question: '中秋礼盒会发什么？',
    description: '以 HR 实际发放的礼盒为准。',
    category: '生活',
    outcomes: ['月饼', '大闸蟹', '水果', '购物卡'],
    createdDaysAgo: 19,
    closeInDays: -6,
    target: [0.55, 0.25, 0.1, 0.1],
    trades: 40,
    resolveTo: 1,
    comments: ['大闸蟹！！！', '我就说吧'],
  },
  {
    question: '上周周会会超过 1 小时吗？',
    description: '以会议纪要中的开始和结束时间为准。',
    category: '公司',
    outcomes: ['是', '否'],
    createdDaysAgo: 9,
    closeInDays: -2,
    target: [0.8, 0.2],
    trades: 30,
  },
  {
    question: '咖啡机这个月会修好吗？',
    description: '以咖啡机能正常出咖啡为准。',
    category: '生活',
    outcomes: ['是', '否'],
    createdDaysAgo: 10,
    closeInDays: -1,
    target: [0.5, 0.5],
    trades: 12,
    cancel: true,
  },
  {
    question: '年底前会有新同事加入我们组吗？',
    description: '以正式入职为准，实习生不算。',
    category: '公司',
    outcomes: ['是', '否'],
    createdDaysAgo: 1,
    closeInDays: 60,
    target: [0.6, 0.4],
    trades: 8,
  },
];

interface Created {
  spec: Spec;
  marketId: number;
  createdAt: number;
  closeAt: number;
  tradingEnd: number;
}

const created: Created[] = specs.map((spec) => {
  const createdAt = now - spec.createdDaysAgo * DAY;
  const closeAt = now + spec.closeInDays * DAY;
  const marketId = createMarket(
    db,
    pick(userIds),
    {
      question: spec.question,
      description: spec.description,
      category: spec.category,
      outcomes: spec.outcomes,
      closeAt,
      liquidity: spec.liquidity ?? 300,
    },
    createdAt,
  );
  return { spec, marketId, createdAt, closeAt, tradingEnd: Math.min(closeAt, now) - HOUR };
});

// Interleave every market's trades in time order so nobody blows their budget on the first market.
const events = created
  .flatMap((m) =>
    Array.from({ length: m.spec.trades }, () => ({ m, t: m.createdAt + rand() * (m.tradingEnd - m.createdAt) })),
  )
  .sort((a, b) => a.t - b.t);

for (const { m, t } of events) {
  const userId = pick(players);
  const outcomes = getOutcomeRows(db, m.marketId);
  const prices = marketProbabilities(
    { status: 'open', resolved_outcome_id: null, liquidity: m.spec.liquidity ?? 300 },
    outcomes,
  );
  // Each trader has a noisy belief around the target and trades towards it.
  const i = Math.floor(rand() * outcomes.length);
  const outcome = outcomes[i]!;
  const belief = m.spec.target[i]! + (rand() - 0.5) * 0.25;
  const edge = belief - prices[i]!;
  const held = db
    .prepare('SELECT shares FROM positions WHERE user_id = ? AND outcome_id = ?')
    .get(userId, outcome.id) as { shares: number } | undefined;
  try {
    if (edge > 0.02) {
      const amount = Math.round(5 + Math.min(edge, 0.4) * 400 * rand());
      executeTrade(db, userId, m.marketId, { side: 'buy', outcomeId: outcome.id, amount }, t);
    } else if (held && held.shares > SHARE_EPSILON) {
      executeTrade(
        db,
        userId,
        m.marketId,
        { side: 'sell', outcomeId: outcome.id, shares: held.shares * (0.3 + rand() * 0.7) },
        t,
      );
    }
  } catch {
    // e.g. out of money — just skip this simulated trade
  }
}

for (const m of created) {
  for (const body of m.spec.comments ?? []) {
    addComment(db, m.marketId, pick(players), body, m.createdAt + rand() * (m.tradingEnd - m.createdAt));
  }
  const outcomes = getOutcomeRows(db, m.marketId);
  if (m.spec.resolveTo !== undefined) {
    resolveMarket(db, m.marketId, outcomes[m.spec.resolveTo]!.id, adminId, '已按实际发放结果结算', m.closeAt + HOUR);
  } else if (m.spec.cancel) {
    cancelMarket(db, m.marketId, adminId, '题目里的「这个月」有歧义，取消重开', m.closeAt + HOUR);
  }
}

const counts = db
  .prepare('SELECT (SELECT COUNT(*) FROM markets) AS markets, (SELECT COUNT(*) FROM trades) AS trades')
  .get() as { markets: number; trades: number };
console.log(`✅ 已生成 ${people.length} 个用户、${counts.markets} 个市场、${counts.trades} 笔交易`);
console.log('   管理员: admin / admin123    其他用户: xiaoming、lili… / demo123');
db.close();
