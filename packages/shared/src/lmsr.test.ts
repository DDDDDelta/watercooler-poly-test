import { describe, expect, it } from 'vitest';
import {
  lmsrCost,
  lmsrCostForShares,
  lmsrInitialShares,
  lmsrPrices,
  lmsrProceedsForShares,
  lmsrSharesForAmount,
  quoteBuy,
  quoteSell,
} from './lmsr';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('lmsr', () => {
  it('starts uniform and prices sum to 1', () => {
    expect(lmsrPrices([0, 0], 100)).toEqual([0.5, 0.5]);
    const p = lmsrPrices([10, -30, 250, 4], 50);
    expect(sum(p)).toBeCloseTo(1, 12);
  });

  it('buying an amount costs exactly that amount', () => {
    const q = [12, -5, 40];
    const b = 300;
    for (const amount of [0.01, 1, 37.5, 1000, 25_000]) {
      const shares = lmsrSharesForAmount(q, b, 1, amount);
      expect(lmsrCostForShares(q, b, 1, shares)).toBeCloseTo(amount, 6);
    }
  });

  it('handles trades far larger than the liquidity parameter', () => {
    const shares = lmsrSharesForAmount([0, 0], 10, 0, 1_000_000);
    expect(Number.isFinite(shares)).toBe(true);
    // each share pays at most 1, so you can never get fewer shares than you paid for
    expect(shares).toBeGreaterThan(1_000_000);
    expect(shares).toBeLessThan(1_000_000 + 10 * Math.log(2) + 1e-6);
  });

  it('buy then sell the same shares round-trips', () => {
    const q = [0, 0];
    const b = 300;
    const buy = quoteBuy(q, b, 0, 100);
    const after = [buy.shares, 0];
    const sell = quoteSell(after, b, 0, buy.shares);
    expect(sell.amount).toBeCloseTo(100, 8);
    expect(sell.pricesAfter[0]).toBeCloseTo(0.5, 10);
  });

  it('buying raises the price, selling lowers it', () => {
    const buy = quoteBuy([0, 0, 0], 100, 2, 50);
    expect(buy.priceAfter).toBeGreaterThan(buy.priceBefore);
    expect(buy.avgPrice).toBeGreaterThan(buy.priceBefore);
    expect(buy.avgPrice).toBeLessThan(buy.priceAfter);
    const sell = quoteSell([0, 0, 50], 100, 2, 20);
    expect(sell.priceAfter).toBeLessThan(sell.priceBefore);
    expect(lmsrProceedsForShares([0, 0, 50], 100, 2, 20)).toBeCloseTo(sell.amount, 12);
  });

  it('initial shares reproduce the requested probabilities', () => {
    const probs = [0.7, 0.3];
    const p = lmsrPrices(lmsrInitialShares(probs, 200), 200);
    expect(p[0]).toBeCloseTo(0.7, 12);
    expect(p[1]).toBeCloseTo(0.3, 12);
  });

  it('cost function is translation invariant', () => {
    expect(lmsrCost([5, 7], 10) - lmsrCost([0, 2], 10)).toBeCloseTo(5, 12);
  });
});
