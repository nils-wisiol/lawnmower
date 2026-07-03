// Seedable PRNG for the level generator (M3). Deterministic by construction: the
// same seed reproduces the same stream, which is what makes generated levels
// shareable/repeatable and lets tests pin a seed (lawnmower.md §2, §5). Uses
// mulberry32 — a tiny, well-distributed 32-bit generator — so we ship no RNG
// dependency and keep the app self-contained for static hosting.

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). Throws if n <= 0. */
  int(n: number): number;
  /** Pick a uniformly-random element of a non-empty array. Throws if empty. */
  pick<T>(items: readonly T[]): T;
}

/**
 * Create a deterministic RNG from an integer seed. Distinct seeds give
 * independent-looking streams; the same seed always replays identically.
 */
export function createRng(seed: number): Rng {
  // mulberry32 state: a single 32-bit accumulator.
  let a = seed >>> 0;

  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (n: number): number => {
    if (n <= 0) throw new Error(`Rng.int requires n > 0, got ${n}`);
    return Math.floor(next() * n);
  };

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new Error('Rng.pick on empty array');
    return items[int(items.length)];
  };

  return { next, int, pick };
}
