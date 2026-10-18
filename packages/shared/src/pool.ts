/**
 * Pari-mutuel (pool) betting.
 *
 * Every bet goes into the pool of the outcome it backs. When the market resolves, the bettors on
 * the winning outcome split the whole pot (all pools together) in proportion to their stakes; if
 * nobody backed the winner, everyone gets their stake back. Nothing is added or taken by the house.
 *
 * The browser uses these helpers to estimate payouts and the server uses `splitPot` to settle,
 * so what people see is exactly the rule they are paid by.
 */

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** Each outcome's share of the pot, used as its implied probability. An empty pot is an even split. */
export function poolShares(pools: readonly number[]): number[] {
  const total = sum(pools);
  if (total <= 0) return pools.map(() => 1 / pools.length);
  return pools.map((p) => p / total);
}

/**
 * Payout per unit staked on outcome `i` if it wins and the pools stay as they are.
 * Null while nobody has backed it (the first bet on it would take the whole pot).
 */
export function payoutMultiplier(pools: readonly number[], i: number): number | null {
  const pool = pools[i] ?? 0;
  return pool > 0 ? sum(pools) / pool : null;
}

/** What a stake of `stake` on outcome `i` would pay if it won right now. */
export function payoutFor(pools: readonly number[], i: number, stake: number): number {
  const pool = pools[i] ?? 0;
  return pool > 0 ? (stake / pool) * sum(pools) : 0;
}

/**
 * Preview of adding `amount` to outcome `i`: the new pools and what `stake + amount` would pay if
 * it won with no further bets (`stake` is what the bettor already has on `i`).
 */
export function previewBet(
  pools: readonly number[],
  i: number,
  amount: number,
  stake = 0,
): { pools: number[]; shares: number[]; payout: number; multiplier: number } {
  const next = pools.slice();
  next[i] = (next[i] ?? 0) + amount;
  const payout = payoutFor(next, i, stake + amount);
  return { pools: next, shares: poolShares(next), payout, multiplier: payout / (stake + amount) };
}

/**
 * Split `pot` (integer cents) among winning stakes (integer cents) in proportion to their size.
 * Rounds down and hands the leftover cents to the largest remainders, so the result always adds
 * up to exactly `pot`. Returns payouts in the same order as `stakes`.
 */
export function splitPot(pot: number, stakes: readonly number[]): number[] {
  const total = sum(stakes);
  if (total <= 0) return stakes.map(() => 0);
  const exact = stakes.map((s) => (pot * s) / total);
  const payouts = exact.map(Math.floor);
  let left = pot - sum(payouts);
  const order = exact.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) payouts[order[k]!.i]! += 1;
  return payouts;
}
