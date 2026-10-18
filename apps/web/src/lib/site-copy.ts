/**
 * Copy that differs between instances, picked at build time with SITE_COPY (see vite.config.ts).
 * `watercooler` is the original office flavour; `neutral` is plain Polymarket-style copy.
 * Plain data with no imports: vite.config.ts reads it too (for the page title).
 */
export interface SiteCopy {
  /** Under the logo and in the page title. */
  tagline: string;
  /** First line of the home headline; the second line is 「变成概率」. */
  heroLead: string;
  /** Examples before 「……用水滴押注你的判断」 on the home page. */
  heroTopics: string;
  /** What people bet on, in the footer blurb. */
  footerTopics: string;
  /** Footer disclaimer, before 「，水滴没有任何现实价值」. */
  disclaimer: string;
  leaderboardSubtitle: string;
  /** Leaderboard with too few people. */
  inviteMore: string;
  registerTitle: string;
  questionPlaceholder: string;
  criteriaPlaceholder: string;
  notFound: string;
}

export const SITE_COPY = {
  watercooler: {
    tagline: '茶水间预测市场',
    heroLead: '把茶水间的八卦',
    heroTopics: '团建去哪、周会多久、指数收在几点',
    footerTopics: '同事间的大事小情',
    disclaimer: '仅供同事间娱乐',
    leaderboardSubtitle: '谁才是茶水间最准的那张嘴',
    inviteMore: '人还不够多，快拉同事来玩',
    registerTitle: '加入茶水间',
    questionPlaceholder: '例如：这周五下午茶会有奶茶吗？',
    criteriaPlaceholder: '例如：以周五 15:00 茶水间实际出现的饮品为准……',
    notFound: '这个页面像茶水间的最后一块蛋糕一样，消失了。',
  },
  neutral: {
    tagline: '预测市场',
    heroLead: '把每一个观点',
    heroTopics: '球赛胜负、币价涨跌、新品发布',
    footerTopics: '你关心的每一件事',
    disclaimer: '仅供娱乐',
    leaderboardSubtitle: '谁的判断最准，排名说了算',
    inviteMore: '人还不够多，快拉朋友来玩',
    registerTitle: '创建账号',
    questionPlaceholder: '例如：比特币年底前会突破 20 万美元吗？',
    criteriaPlaceholder: '例如：以 CoinMarketCap 上 12 月 31 日 23:59（北京时间）的价格为准……',
    notFound: '这个页面不存在，可能已被删除，或者链接有误。',
  },
} satisfies Record<string, SiteCopy>;

export type SiteCopyName = keyof typeof SITE_COPY;
