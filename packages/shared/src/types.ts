// API data-transfer objects shared by server and web.
// Money amounts are expressed in currency units (2 decimal places); timestamps are unix ms.

export interface UserRef {
  id: number;
  username: string;
  displayName: string;
}

export interface PublicUser extends UserRef {
  createdAt: number;
  /** AI bot account: only plays in the AI zone and is left off the leaderboard. */
  isBot: boolean;
}

export interface Me extends PublicUser {
  balance: number;
  canClaimBonus: boolean;
}

export interface AppConfig {
  inviteRequired: boolean;
  startingBalance: number;
  dailyBonus: number;
  privateMode: boolean;
  /** Whether the AI zone exists (bots are running or there are AI markets). */
  aiZone: boolean;
  /** Whether the WeCom (企业微信) bot is connected, so accounts can be bound to it. */
  wecom: boolean;
}

/** `closed` is derived: betting time is over but the creator has not announced the result yet. */
export type MarketStatus = 'open' | 'closed' | 'resolved' | 'cancelled';

export interface Outcome {
  id: number;
  index: number;
  label: string;
  /** Total staked on this outcome. */
  pool: number;
  /** Share of the pot on this outcome, read as the crowd's probability. */
  probability: number;
  /** Probability change over the last 24h, or null when unknown. */
  change24h: number | null;
}

export interface MarketSummary {
  id: number;
  question: string;
  category: string;
  status: MarketStatus;
  isBinary: boolean;
  /** Created by an AI bot; lives in the AI zone. */
  isAi: boolean;
  /** Everything staked so far (the pot winners split). */
  pot: number;
  closeAt: number;
  createdAt: number;
  resolvedOutcomeId: number | null;
  bettorCount: number;
  commentCount: number;
  creator: UserRef;
  outcomes: Outcome[];
  /** Recent probability of the first outcome (open binary markets only, else empty). */
  spark: number[];
}

export interface MarketDetail extends MarketSummary {
  description: string;
  resolvedAt: number | null;
  resolutionNote: string | null;
  /** If still unresolved at this time, the market is cancelled and everyone refunded. */
  resolveBy: number;
}

/** A user's total stake on one outcome. */
export interface Stake {
  outcomeId: number;
  amount: number;
}

export interface MarketDetailResponse {
  market: MarketDetail;
  /** The current user's stakes in this market (empty when logged out). */
  stakes: Stake[];
}

export interface PricePoint {
  t: number;
  probs: number[];
}

export interface Bet {
  id: number;
  user: UserRef;
  marketId: number;
  marketQuestion: string;
  outcomeId: number;
  outcomeLabel: string;
  amount: number;
  createdAt: number;
}

export interface Holder {
  user: UserRef;
  outcomeId: number;
  amount: number;
}

export interface Comment {
  id: number;
  user: UserRef;
  body: string;
  createdAt: number;
}

export interface BetResult {
  bet: Bet;
  balance: number;
  market: MarketDetail;
  stakes: Stake[];
}

export type PortfolioState = 'active' | 'won' | 'lost' | 'refunded';

export interface PortfolioBet {
  market: Pick<MarketSummary, 'id' | 'question' | 'status' | 'closeAt' | 'isBinary' | 'resolvedOutcomeId'>;
  outcomeId: number;
  outcomeLabel: string;
  stake: number;
  /** Payout if it wins with the pools as they are now (active), or what was actually paid out. */
  payout: number;
  /** Settled result (payout - stake); null while the market is still undecided. */
  pnl: number | null;
  state: PortfolioState;
}

export type LedgerKind = 'signup' | 'bonus' | 'bet' | 'payout' | 'refund';

export interface LedgerEntry {
  id: number;
  kind: LedgerKind;
  amount: number;
  balanceAfter: number;
  marketId: number | null;
  marketQuestion: string | null;
  note: string | null;
  createdAt: number;
}

export interface UserStats {
  balance: number;
  /** Stakes in markets that have not been settled yet. */
  staked: number;
  /** balance + staked */
  netWorth: number;
  /** Total currency received for free (signup and daily bonus). */
  funded: number;
  /** netWorth - funded: only settled bets move it. */
  profit: number;
  betCount: number;
  marketsBet: number;
}

export interface Portfolio {
  stats: UserStats;
  bets: PortfolioBet[];
}

export interface UserProfile {
  user: PublicUser;
  stats: UserStats;
  /** Leaderboard position; null for bots, which are not ranked. */
  rank: number | null;
  bets: PortfolioBet[];
  recentBets: Bet[];
  createdMarkets: MarketSummary[];
}

export interface LeaderboardEntry {
  rank: number;
  user: UserRef;
  stats: UserStats;
}

/** The AI zone at a glance. */
export interface AiZoneSummary {
  bots: number;
  openMarkets: number;
  /** Total staked in AI markets so far. */
  pot: number;
  /** What people (not bots) have won or lost on settled AI markets. */
  humanProfit: number;
  /** The bots with the most money. */
  richestBots: LeaderboardEntry[];
}

/** Stats for markets made by people (the AI zone has its own summary). */
export interface SiteStats {
  openMarkets: number;
  totalStaked: number;
  bettors: number;
  users: number;
}

/** A site account's link to a WeCom (企业微信) account. */
export interface WecomBinding {
  wecomUserId: string;
  createdAt: number;
}

/** What a binding link would do, shown before the user confirms. */
export interface WecomBindRequest {
  wecomUserId: string;
  expiresAt: number;
  /** The signed-in user's current binding, which confirming would replace. */
  current: WecomBinding | null;
}
