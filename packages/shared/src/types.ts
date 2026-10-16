// API data-transfer objects shared by server and web.
// Money amounts are expressed in currency units (2 decimal places); timestamps are unix ms.

export type Role = 'user' | 'admin';

export interface UserRef {
  id: number;
  username: string;
  displayName: string;
}

export interface PublicUser extends UserRef {
  role: Role;
  createdAt: number;
}

export interface Me extends PublicUser {
  balance: number;
  canClaimBonus: boolean;
}

export interface AppConfig {
  inviteRequired: boolean;
  startingBalance: number;
  dailyBonus: number;
  allowUserMarkets: boolean;
  privateMode: boolean;
}

/** `closed` is derived: trading time is over but nobody has resolved the market yet. */
export type MarketStatus = 'open' | 'closed' | 'resolved' | 'cancelled';

export interface Outcome {
  id: number;
  index: number;
  label: string;
  /** LMSR outstanding shares (q_i). */
  shares: number;
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
  liquidity: number;
  volume: number;
  closeAt: number;
  createdAt: number;
  resolvedOutcomeId: number | null;
  traderCount: number;
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
  resolvedBy: UserRef | null;
}

export interface MarketPosition {
  outcomeId: number;
  shares: number;
  /** Cost basis of the shares still held. */
  cost: number;
}

export interface MarketDetailResponse {
  market: MarketDetail;
  /** The current user's holdings in this market (empty when logged out). */
  positions: MarketPosition[];
}

export interface PricePoint {
  t: number;
  probs: number[];
}

export type TradeSide = 'buy' | 'sell';

export interface Trade {
  id: number;
  user: UserRef;
  marketId: number;
  marketQuestion: string;
  outcomeId: number;
  outcomeLabel: string;
  side: TradeSide;
  shares: number;
  amount: number;
  priceAfter: number;
  createdAt: number;
}

export interface Holder {
  user: UserRef;
  outcomeId: number;
  shares: number;
}

export interface Comment {
  id: number;
  user: UserRef;
  body: string;
  createdAt: number;
}

export interface TradeResult {
  trade: Trade;
  balance: number;
  market: MarketDetail;
  positions: MarketPosition[];
}

export type PortfolioPositionState = 'active' | 'won' | 'lost' | 'refunded';

export interface PortfolioPosition {
  market: Pick<MarketSummary, 'id' | 'question' | 'status' | 'closeAt' | 'isBinary' | 'resolvedOutcomeId'>;
  outcomeId: number;
  outcomeLabel: string;
  shares: number;
  cost: number;
  avgPrice: number;
  price: number;
  /** Mark-to-market value (or final payout once resolved). */
  value: number;
  pnl: number;
  state: PortfolioPositionState;
}

export type LedgerKind = 'signup' | 'bonus' | 'grant' | 'buy' | 'sell' | 'payout' | 'refund';

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
  positionsValue: number;
  netWorth: number;
  /** Total currency granted (signup bonus, daily bonus, admin grants). */
  funded: number;
  profit: number;
  tradeCount: number;
  marketsTraded: number;
}

export interface Portfolio {
  stats: UserStats;
  positions: PortfolioPosition[];
}

export interface UserProfile {
  user: PublicUser;
  stats: UserStats;
  rank: number;
  positions: PortfolioPosition[];
  trades: Trade[];
  createdMarkets: MarketSummary[];
}

export interface LeaderboardEntry {
  rank: number;
  user: UserRef;
  stats: UserStats;
}

export interface SiteStats {
  openMarkets: number;
  totalVolume: number;
  traders: number;
  users: number;
}

export interface AdminUser extends PublicUser {
  balance: number;
  netWorth: number;
  tradeCount: number;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: number | null;
}
