/** Display name of the play-money currency. */
export const CURRENCY_NAME = '水滴';

export const CATEGORIES = ['公司', '行情', '科技', '体育', '生活', '娱乐', '其他'] as const;
export type Category = (typeof CATEGORIES)[number];

export const MIN_OUTCOMES = 2;
export const MAX_OUTCOMES = 10;

/** Smallest and largest single bet, in currency units. */
export const MIN_BET = 1;
export const MAX_BET = 1_000_000;

/** The creator must announce the result within this many days after betting closes, or the market is cancelled. */
export const RESOLVE_GRACE_DAYS = 7;
