import { describe, expect, it } from 'vitest';
import { payoutFor, payoutMultiplier, poolShares, previewBet, splitPot } from './pool';

describe('pool', () => {
  it('shares are the pot split, even while empty', () => {
    expect(poolShares([0, 0])).toEqual([0.5, 0.5]);
    expect(poolShares([0, 0, 0, 0])).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(poolShares([300, 100])).toEqual([0.75, 0.25]);
  });

  it('multiplier and payout follow the whole pot', () => {
    expect(payoutMultiplier([300, 100], 0)).toBeCloseTo(4 / 3, 12);
    expect(payoutMultiplier([300, 100], 1)).toBe(4);
    expect(payoutMultiplier([300, 0], 1)).toBeNull();
    expect(payoutFor([300, 100], 1, 50)).toBe(200);
    expect(payoutFor([300, 0], 1, 50)).toBe(0);
  });

  it('previews a bet including the bettor’s existing stake', () => {
    // 300 on A, 100 on B; I already have 50 on B and add 100 more.
    const p = previewBet([300, 100], 1, 100, 50);
    expect(p.pools).toEqual([300, 200]);
    expect(p.shares).toEqual([0.6, 0.4]);
    expect(p.payout).toBeCloseTo((150 / 200) * 500, 9);
    expect(p.multiplier).toBeCloseTo(2.5, 9);
    // The very first bet on an outcome would get the whole pot.
    expect(previewBet([300, 0], 1, 10).payout).toBe(310);
  });

  it('splits the pot exactly, rounding fairly', () => {
    expect(splitPot(1000, [100, 300])).toEqual([250, 750]);
    const odd = splitPot(1001, [1, 1, 1]);
    expect(odd.reduce((a, b) => a + b, 0)).toBe(1001);
    expect(odd).toEqual([334, 334, 333]);
    const many = splitPot(99_999, [7, 13, 29, 51]);
    expect(many.reduce((a, b) => a + b, 0)).toBe(99_999);
    many.forEach((x, i) => expect(Math.abs(x - (99_999 * [7, 13, 29, 51][i]!) / 100)).toBeLessThan(1));
    expect(splitPot(500, [])).toEqual([]);
    expect(splitPot(500, [0, 0])).toEqual([0, 0]);
  });
});
