import { describe, expect, it } from 'vitest';

import { LevelStore, type StorageLike } from '../../../src/game/storage.ts';

/** In-memory Storage stand-in for deterministic, DOM-free persistence tests. */
function fakeStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

/** A Storage whose setItem always throws — private mode / quota exhausted. */
function throwingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error('unavailable');
    },
    setItem: () => {
      throw new Error('quota exceeded');
    },
  };
}

describe('LevelStore — best times', () => {
  it('has no best time for an unseen code', () => {
    const store = new LevelStore(fakeStorage());
    expect(store.bestTimeMs('1.1.4x4.70')).toBeUndefined();
  });

  it('records the first time as a new best', () => {
    const store = new LevelStore(fakeStorage());
    expect(store.recordTime('1.1.4x4.70', 5000)).toBe(true);
    expect(store.bestTimeMs('1.1.4x4.70')).toBe(5000);
  });

  it('keeps only the fastest time and reports non-improvements', () => {
    const store = new LevelStore(fakeStorage());
    store.recordTime('1.1.4x4.70', 5000);

    expect(store.recordTime('1.1.4x4.70', 4200)).toBe(true); // faster → new best
    expect(store.bestTimeMs('1.1.4x4.70')).toBe(4200);

    expect(store.recordTime('1.1.4x4.70', 9000)).toBe(false); // slower → ignored
    expect(store.bestTimeMs('1.1.4x4.70')).toBe(4200);

    expect(store.recordTime('1.1.4x4.70', 4200)).toBe(false); // equal → not a new best
  });

  it('keeps best times per code (a shared seed carries its own record)', () => {
    const store = new LevelStore(fakeStorage());
    store.recordTime('1.1.4x4.70', 5000);
    store.recordTime('1.2.4x4.70', 3000);
    expect(store.bestTimeMs('1.1.4x4.70')).toBe(5000);
    expect(store.bestTimeMs('1.2.4x4.70')).toBe(3000);
  });

  it('survives a fresh store over the same backing storage (reload)', () => {
    const backing = fakeStorage();
    new LevelStore(backing).recordTime('1.1.4x4.70', 4200);
    // A new LevelStore over the same storage is what a page reload looks like.
    expect(new LevelStore(backing).bestTimeMs('1.1.4x4.70')).toBe(4200);
  });
});

describe('LevelStore — seed history', () => {
  it('starts empty', () => {
    expect(new LevelStore(fakeStorage()).seedHistory()).toEqual([]);
  });

  it('keeps recent codes most-recent-first, deduped', () => {
    const store = new LevelStore(fakeStorage());
    store.pushSeed('a');
    store.pushSeed('b');
    store.pushSeed('a'); // re-visiting a moves it back to the front
    expect(store.seedHistory()).toEqual(['a', 'b']);
  });

  it('caps the history length', () => {
    const store = new LevelStore(fakeStorage());
    for (let i = 0; i < 30; i++) store.pushSeed(`code-${i}`);
    expect(store.seedHistory().length).toBe(20);
    expect(store.seedHistory()[0]).toBe('code-29'); // newest first
  });
});

describe('LevelStore — tutorial-seen flag (M6 onboarding gate)', () => {
  it('is unseen until marked, then stays seen', () => {
    const store = new LevelStore(fakeStorage());
    expect(store.hasSeenTutorial()).toBe(false);
    store.markTutorialSeen();
    expect(store.hasSeenTutorial()).toBe(true);
  });

  it('degrades to "unseen" when storage is unavailable', () => {
    const store = new LevelStore(throwingStorage());
    expect(() => store.markTutorialSeen()).not.toThrow();
    expect(store.hasSeenTutorial()).toBe(false);
  });
});

describe('LevelStore — unavailable storage degrades safely', () => {
  it('treats an undefined store as no-persistence', () => {
    const store = new LevelStore(undefined);
    expect(store.recordTime('1.1.4x4.70', 5000)).toBe(true); // no prior → "new"
    expect(store.bestTimeMs('1.1.4x4.70')).toBeUndefined(); // but nothing persisted
    expect(store.seedHistory()).toEqual([]);
  });

  it('swallows throwing getItem/setItem (private mode / quota)', () => {
    const store = new LevelStore(throwingStorage());
    expect(() => store.recordTime('1.1.4x4.70', 5000)).not.toThrow();
    expect(store.bestTimeMs('1.1.4x4.70')).toBeUndefined();
    expect(() => store.pushSeed('a')).not.toThrow();
    expect(store.seedHistory()).toEqual([]);
  });
});
