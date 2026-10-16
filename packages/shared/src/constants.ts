/** Display name of the play-money currency. */
export const CURRENCY_NAME = '水滴';

export const CATEGORIES = ['公司', '行情', '科技', '体育', '生活', '娱乐', '其他'] as const;
export type Category = (typeof CATEGORIES)[number];

/** LMSR liquidity presets (the `b` parameter). */
export const LIQUIDITY_PRESETS = [
  { value: 100, label: '低', hint: '价格对下注很敏感，适合小圈子' },
  { value: 300, label: '中', hint: '默认，适合大多数市场' },
  { value: 1000, label: '高', hint: '价格稳定，需要大量资金才能推动' },
] as const;
export const DEFAULT_LIQUIDITY = 300;
export const MIN_LIQUIDITY = 20;
export const MAX_LIQUIDITY = 10_000;

export const MIN_OUTCOMES = 2;
export const MAX_OUTCOMES = 10;

/** Smallest buy order, in currency units. */
export const MIN_TRADE_AMOUNT = 1;
export const MAX_TRADE_AMOUNT = 1_000_000;

/** Positions smaller than this are treated as empty. */
export const SHARE_EPSILON = 1e-6;
