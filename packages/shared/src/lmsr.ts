/**
 * Logarithmic Market Scoring Rule (Hanson's LMSR) automated market maker.
 *
 * State `q[i]` is the number of outstanding shares of outcome i and `b` is the
 * liquidity parameter: larger b = deeper market, prices move less per trade.
 * Each winning share pays out exactly 1 unit when the market resolves, so the
 * instantaneous price of an outcome is also its implied probability.
 *
 *   C(q)  = b * ln(sum_j exp(q_j / b))
 *   p_i   = exp(q_i / b) / sum_j exp(q_j / b)
 *
 * All helpers are numerically stable (log-sum-exp) and pure, so the browser
 * uses exactly the same code to preview a trade as the server uses to execute it.
 */

function logSumExp(xs: readonly number[]): number {
  let m = -Infinity;
  for (const x of xs) if (x > m) m = x;
  let s = 0;
  for (const x of xs) s += Math.exp(x - m);
  return m + Math.log(s);
}

function at(q: readonly number[], i: number): number {
  const v = q[i];
  if (v === undefined) throw new RangeError(`outcome index ${i} out of range`);
  return v;
}

/** Total cost function C(q). */
export function lmsrCost(q: readonly number[], b: number): number {
  return b * logSumExp(q.map((x) => x / b));
}

/** Current prices (= implied probabilities); they always sum to 1. */
export function lmsrPrices(q: readonly number[], b: number): number[] {
  const xs = q.map((x) => x / b);
  let m = -Infinity;
  for (const x of xs) if (x > m) m = x;
  const exps = xs.map((x) => Math.exp(x - m));
  const sum = exps.reduce((a, c) => a + c, 0);
  return exps.map((e) => e / sum);
}

/** Cost of buying `shares` of outcome i (negative shares = proceeds of selling, negated). */
export function lmsrCostForShares(q: readonly number[], b: number, i: number, shares: number): number {
  const next = q.slice();
  next[i] = at(q, i) + shares;
  return lmsrCost(next, b) - lmsrCost(q, b);
}

/** Number of shares of outcome i received for spending `amount`. */
export function lmsrSharesForAmount(q: readonly number[], b: number, i: number, amount: number): number {
  if (!(amount > 0)) return 0;
  const logP = at(q, i) / b - logSumExp(q.map((x) => x / b));
  const p = Math.exp(logP);
  const x = amount / b;
  // Solve C(q + Δe_i) - C(q) = amount  =>  Δ = b * ln(1 + (e^x - 1) / p)
  const r = Math.expm1(x) / p;
  if (Number.isFinite(r)) return b * Math.log1p(r);
  // Huge trades: ln(e^x - 1 + p) - ln p = x + ln(1 - (1 - p)e^-x) - ln p
  return b * (x + Math.log1p(-(1 - p) * Math.exp(-x)) - logP);
}

/** Amount received for selling `shares` of outcome i back to the market maker. */
export function lmsrProceedsForShares(q: readonly number[], b: number, i: number, shares: number): number {
  if (!(shares > 0)) return 0;
  return -lmsrCostForShares(q, b, i, -shares);
}

/** Initial share vector that makes the market open at the given probabilities. */
export function lmsrInitialShares(probs: readonly number[], b: number): number[] {
  return probs.map((p) => b * Math.log(p));
}

/** Worst-case subsidy the market maker can lose: b * ln(n). */
export function lmsrMaxLoss(b: number, outcomes: number): number {
  return b * Math.log(outcomes);
}

export interface TradeQuote {
  /** Shares bought or sold. */
  shares: number;
  /** Amount paid (buy) or received (sell). */
  amount: number;
  /** Average price per share. */
  avgPrice: number;
  priceBefore: number;
  priceAfter: number;
  /** Probabilities of every outcome after the trade. */
  pricesAfter: number[];
}

export function quoteBuy(q: readonly number[], b: number, i: number, amount: number): TradeQuote {
  const priceBefore = at(lmsrPrices(q, b), i);
  const shares = lmsrSharesForAmount(q, b, i, amount);
  const next = q.slice();
  next[i] = at(q, i) + shares;
  const pricesAfter = lmsrPrices(next, b);
  return {
    shares,
    amount,
    avgPrice: shares > 0 ? amount / shares : priceBefore,
    priceBefore,
    priceAfter: at(pricesAfter, i),
    pricesAfter,
  };
}

export function quoteSell(q: readonly number[], b: number, i: number, shares: number): TradeQuote {
  const priceBefore = at(lmsrPrices(q, b), i);
  const amount = lmsrProceedsForShares(q, b, i, shares);
  const next = q.slice();
  next[i] = at(q, i) - shares;
  const pricesAfter = lmsrPrices(next, b);
  return {
    shares,
    amount,
    avgPrice: shares > 0 ? amount / shares : priceBefore,
    priceBefore,
    priceAfter: at(pricesAfter, i),
    pricesAfter,
  };
}
