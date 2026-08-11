import { describe, expect, it } from 'vitest';
import { pickerIndex, roundOf } from '@/lib/draft';

describe('snake order', () => {
  it('odd rounds go 1..N, even rounds N..1', () => {
    const n = 4;
    // Round 1: picks 1-4 -> managers 0,1,2,3
    expect([1, 2, 3, 4].map((p) => pickerIndex(p, n))).toEqual([0, 1, 2, 3]);
    // Round 2: picks 5-8 -> managers 3,2,1,0
    expect([5, 6, 7, 8].map((p) => pickerIndex(p, n))).toEqual([3, 2, 1, 0]);
    // Round 3 flips back
    expect([9, 10, 11, 12].map((p) => pickerIndex(p, n))).toEqual([0, 1, 2, 3]);
  });

  it('gives every manager exactly 15 picks over 15 rounds', () => {
    for (const n of [4, 7, 8, 12]) {
      const counts = new Array<number>(n).fill(0);
      for (let p = 1; p <= n * 15; p++) counts[pickerIndex(p, n)]++;
      expect(counts.every((c) => c === 15)).toBe(true);
    }
  });

  it('turn pairs at the snake turn belong to the same manager', () => {
    const n = 8;
    // Pick 8 and 9 are both manager index 7.
    expect(pickerIndex(8, n)).toBe(7);
    expect(pickerIndex(9, n)).toBe(7);
    // Pick 16 and 17 are both manager index 0.
    expect(pickerIndex(16, n)).toBe(0);
    expect(pickerIndex(17, n)).toBe(0);
  });

  it('computes rounds', () => {
    expect(roundOf(1, 8)).toBe(1);
    expect(roundOf(8, 8)).toBe(1);
    expect(roundOf(9, 8)).toBe(2);
    expect(roundOf(120, 8)).toBe(15);
  });
});
