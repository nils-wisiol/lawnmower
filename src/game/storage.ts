// In-browser persistence (M5): best completion times per level (keyed by the
// level's short-form code) plus a small recent-seed history (lawnmower.md §9 M5,
// "in-browser storage (best times, settings, seed history)"). No server — all
// state is local (lawnmower.md §5 "Data model & storage").
//
// Backed by localStorage in the browser but written against any Storage-like
// object, so unit tests inject a fake. Every access is guarded: a disabled or full
// store (private mode, quota exceeded) degrades to "no persistence" rather than
// throwing into the game loop.

const BEST_PREFIX = 'lawnmower:v1:best:';
const HISTORY_KEY = 'lawnmower:v1:seeds';
const HISTORY_LIMIT = 20;

/** The slice of the Storage API we use — localStorage in the browser, a fake in tests. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Persists best times and seed history. Constructed with a StorageLike (or
 * undefined for an inert, no-persistence store). Keyed by level code, so a best
 * time is tied to the exact reproducible level — a shared seed carries its record.
 */
export class LevelStore {
  constructor(private readonly storage: StorageLike | undefined) {}

  /** Best recorded completion time (ms) for a level code, or undefined if none. */
  bestTimeMs(code: string): number | undefined {
    const raw = this.read(BEST_PREFIX + code);
    if (raw === null) return undefined;
    const ms = Number(raw);
    return Number.isFinite(ms) ? ms : undefined;
  }

  /**
   * Record a completion time, keeping only the fastest. Returns true when this is a
   * new record (no prior time, or faster than the stored one) so the app can show a
   * "new best!" flourish.
   */
  recordTime(code: string, ms: number): boolean {
    const prev = this.bestTimeMs(code);
    if (prev !== undefined && prev <= ms) return false;
    this.write(BEST_PREFIX + code, String(ms));
    return true;
  }

  /** Recently played level codes, most-recent first. */
  seedHistory(): string[] {
    const raw = this.read(HISTORY_KEY);
    if (raw === null) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
    } catch {
      return [];
    }
  }

  /** Move a code to the front of the recent list (deduped, capped at HISTORY_LIMIT). */
  pushSeed(code: string): void {
    const next = [code, ...this.seedHistory().filter((c) => c !== code)].slice(0, HISTORY_LIMIT);
    this.write(HISTORY_KEY, JSON.stringify(next));
  }

  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch {
      // Persistence unavailable (private mode / quota) — degrade silently to no-op.
    }
  }
}

/** The real browser-backed store, or an inert one when localStorage is unavailable. */
export function browserStore(): LevelStore {
  try {
    return new LevelStore(typeof localStorage !== 'undefined' ? localStorage : undefined);
  } catch {
    return new LevelStore(undefined);
  }
}
