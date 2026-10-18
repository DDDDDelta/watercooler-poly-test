// API data-transfer objects shared by server and web.
// Money amounts are expressed in currency units (2 decimal places); timestamps are unix ms.

export interface UserRef {
  id: number;
  username: string;
  displayName: string;
}

export interface PublicUser extends UserRef {
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
  privateMode: boolean;
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
  mode: 'pool' | 'polymarket';
  id: number;
  question: string;
  category: string;
  status: MarketStatus;
  isBinary: boolean;
  /** Pool pot, or currently locked complete-set collateral for a Polymarket market. */
  pot: number;
  closeAt: number;
  /** Earliest time the creator may publish the result and settle. */
  settleAt: number;
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

export type LedgerKind =
  'signup' | 'bonus' | 'bet' | 'payout' | 'refund' | 'split' | 'merge' | 'order_lock' | 'order_release' | 'sell';

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
  /** Unsettled pool stakes + exchange shares at mark price + cash locked in bids. */
  staked: number;
  /** balance + staked */
  netWorth: number;
  /** Total currency received for free (signup and daily bonus). */
  funded: number;
  /** netWorth - funded; exchange holdings use the current mark price. */
  profit: number;
  betCount: number;
  marketsBet: number;
}

export interface Portfolio {
  stats: UserStats;
  bets: PortfolioBet[];
  exchangePositions: ExchangePortfolioPosition[];
  exchangeOrders: ExchangePortfolioOrder[];
}

export interface ExchangePosition {
  outcomeId: number;
  quantity: number;
  reserved: number;
}
export interface ExchangePortfolioPosition extends ExchangePosition {
  marketId: number;
  question: string;
  outcomeLabel: string;
  status: MarketStatus;
  price: number;
}
export interface ExchangeOrder {
  postOnly: boolean;
  clientOrderId: string | null;
  id: number;
  outcomeId: number;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  remaining: number;
  status: 'open' | 'filled' | 'cancelled';
  createdAt: number;
}
export interface ExchangePortfolioOrder extends ExchangeOrder {
  marketId: number;
  question: string;
  outcomeLabel: string;
}
export interface BookLevel {
  price: number;
  quantity: number;
}
export interface ExchangeState {
  collateral: number;
  books: { outcomeId: number; bids: BookLevel[]; asks: BookLevel[]; lastPrice: number | null }[];
  positions: ExchangePosition[];
  orders: ExchangeOrder[];
  trades: {
    id: number;
    outcomeId: number;
    price: number;
    quantity: number;
    kind: 'transfer' | 'mint' | 'merge';
    createdAt: number;
  }[];
}

export interface UserProfile {
  user: PublicUser;
  stats: UserStats;
  rank: number;
  bets: PortfolioBet[];
  recentBets: Bet[];
  createdMarkets: MarketSummary[];
}

export interface LeaderboardEntry {
  rank: number;
  user: UserRef;
  stats: UserStats;
}

export interface SiteStats {
  openMarkets: number;
  totalStaked: number;
  bettors: number;
  users: number;
}
