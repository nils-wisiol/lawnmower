import { describe, expect, it } from 'vitest';

import { createRng } from '../../../src/gen/index.ts';

describe('createRng — deterministic seeding', () => {
  it('replays an identical stream for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different streams for different seeds', () => {
    const a = Array.from({ length: 10 }, createRng(1).next);
    const b = Array.from({ length: 10 }, createRng(2).next);
    expect(a).not.toEqual(b);
  });

  it('keeps next() in [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(n) stays in [0, n) and covers the range', () => {
    const rng = createRng(123);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(4);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(4);
      expect(Number.isInteger(v)).toBe(true);
      seen.add(v);
    }
    expect(seen).toEqual(new Set([0, 1, 2, 3]));
  });

  it('rejects int(n) for n <= 0 and pick on an empty array', () => {
    const rng = createRng(0);
    expect(() => rng.int(0)).toThrow(/n > 0/);
    expect(() => rng.pick([])).toThrow(/empty/);
  });
});
