import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GameSession } from '../../../src/game/session.ts';
import { levelFromAscii, type Clock, type Level } from '../../../src/model/index.ts';

/** Deterministic clock so the wall-clock timer is testable without real time. */
function fakeClock(): Clock & { advance(ms: number): void } {
  let t = 0;
  return { now: () => t, advance: (ms) => (t += ms) };
}

// A 1x3 row: start (mowed on load) + two grass cells to the right. Right-right
// wins; right-then-left re-mows the start and crashes. Layout is deterministic.
const ROW = 'S..';
const rowLevel = (config?: Level['config']): Level => ({ ...levelFromAscii(ROW), config });

describe('GameSession — timer start policy', () => {
  let clock: ReturnType<typeof fakeClock>;

  beforeEach(() => {
    clock = fakeClock();
  });

  it('default (firstMove): the clock is free until the first move', () => {
    const session = new GameSession(rowLevel(), { clock });
    clock.advance(5000); // planning time before the first move is free (§2)
    expect(session.elapsedMs()).toBe(0);

    session.move('right'); // clock starts here
    clock.advance(2000);
    expect(session.elapsedMs()).toBe(2000);
  });

  it('load policy: the clock runs from the moment the level loads', () => {
    const session = new GameSession(rowLevel({ timerStart: 'load' }), { clock });
    clock.advance(1500);
    expect(session.elapsedMs()).toBe(1500);
  });
});

describe('GameSession — scoring', () => {
  it('freezes the completion time on a win (the score)', () => {
    const clock = fakeClock();
    const session = new GameSession(rowLevel(), { clock });

    session.move('right');
    clock.advance(4200);
    expect(session.move('right')).toBe('won');
    expect(session.status).toBe('won');

    clock.advance(9999); // time after the win must not inflate the score
    expect(session.elapsedMs()).toBe(4200);
  });
});

describe('GameSession — fail reasons', () => {
  it('a re-mow is a crash', () => {
    const session = new GameSession(rowLevel(), { clock: fakeClock() });
    session.move('right'); // onto cell 1
    expect(session.move('left')).toBe('lost'); // back onto the mowed start
    expect(session.status).toBe('lost');
    expect(session.failReason).toBe('crash');
  });

  it('exceeding the time limit fails on tick, with no input (§2)', () => {
    const clock = fakeClock();
    const session = new GameSession(rowLevel({ timerStart: 'load', timeLimitMs: 1000 }), { clock });

    clock.advance(999);
    session.tick();
    expect(session.status).toBe('playing');

    clock.advance(1); // now at the limit
    session.tick();
    expect(session.status).toBe('lost');
    expect(session.failReason).toBe('timeout');
    expect(session.remainingMs()).toBe(0);
  });

  it('blocks a move once the time limit is spent', () => {
    const clock = fakeClock();
    const session = new GameSession(rowLevel({ timerStart: 'load', timeLimitMs: 1000 }), { clock });

    clock.advance(1500);
    expect(session.move('right')).toBe('blocked'); // the pending timeout fails first
    expect(session.status).toBe('lost');
    expect(session.failReason).toBe('timeout');
  });

  it('reports remaining time while a timed level is in progress', () => {
    const clock = fakeClock();
    const session = new GameSession(rowLevel({ timerStart: 'load', timeLimitMs: 5000 }), { clock });
    clock.advance(1500);
    expect(session.remainingMs()).toBe(3500);
    expect(session.timeLimitMs()).toBe(5000);
  });

  it('an untimed level never times out and reports no remaining time', () => {
    const clock = fakeClock();
    const session = new GameSession(rowLevel(), { clock });
    session.move('right');
    clock.advance(1_000_000);
    session.tick();
    expect(session.status).toBe('playing');
    expect(session.remainingMs()).toBeUndefined();
    expect(session.timeLimitMs()).toBeUndefined();
  });
});

describe('GameSession — restart & next-level flow', () => {
  it('restart replays the same level and resets the clock', () => {
    const clock = fakeClock();
    const session = new GameSession(rowLevel(), { clock });
    const level = session.level;

    session.move('right');
    session.move('left'); // crash
    expect(session.status).toBe('lost');

    session.restart();
    expect(session.status).toBe('playing');
    expect(session.level).toBe(level); // same level
    expect(session.failReason).toBeUndefined();
    expect(session.elapsedMs()).toBe(0);
  });

  it('advance loads the next level after a win', () => {
    const clock = fakeClock();
    const nextA = rowLevel();
    const nextLevel = vi.fn(() => nextA);
    const session = new GameSession(rowLevel(), { clock, nextLevel });

    session.move('right');
    session.move('right'); // win
    expect(session.status).toBe('won');

    session.advance();
    expect(nextLevel).toHaveBeenCalledTimes(1);
    expect(session.level).toBe(nextA);
    expect(session.status).toBe('playing');
  });

  it('advance after a loss retries the same level (no next-level draw)', () => {
    const nextLevel = vi.fn(() => rowLevel());
    const session = new GameSession(rowLevel(), { clock: fakeClock(), nextLevel });
    const level = session.level;

    session.move('right');
    session.move('left'); // crash
    session.advance();

    expect(nextLevel).not.toHaveBeenCalled();
    expect(session.level).toBe(level);
    expect(session.status).toBe('playing');
  });

  it('advance is a no-op while still playing', () => {
    const nextLevel = vi.fn(() => rowLevel());
    const session = new GameSession(rowLevel(), { clock: fakeClock(), nextLevel });
    session.advance();
    expect(nextLevel).not.toHaveBeenCalled();
    expect(session.status).toBe('playing');
  });
});
