import { beforeEach, describe, expect, it } from 'vitest';

import { formatTime, Stopwatch, type Clock } from '../../../src/model/timing.ts';

/** A hand-cranked clock so timing is fully deterministic (no real wall-clock). */
function fakeClock(): Clock & { set(ms: number): void; advance(ms: number): void } {
  let t = 0;
  return {
    now: () => t,
    set: (ms) => {
      t = ms;
    },
    advance: (ms) => {
      t += ms;
    },
  };
}

describe('Stopwatch (injected clock)', () => {
  let clock: ReturnType<typeof fakeClock>;
  let sw: Stopwatch;

  beforeEach(() => {
    clock = fakeClock();
    sw = new Stopwatch(clock);
  });

  it('reads 0 and is not started/running before start', () => {
    clock.advance(5000); // time passing before start must not count
    expect(sw.started).toBe(false);
    expect(sw.running).toBe(false);
    expect(sw.elapsedMs()).toBe(0);
  });

  it('measures elapsed time from start while running', () => {
    clock.set(1000);
    sw.start();
    expect(sw.running).toBe(true);
    clock.set(3500);
    expect(sw.elapsedMs()).toBe(2500);
  });

  it('start() is idempotent — keeps the original start time', () => {
    clock.set(1000);
    sw.start();
    clock.set(2000);
    sw.start(); // must NOT reset the origin (backs "start on first move")
    clock.set(4000);
    expect(sw.elapsedMs()).toBe(3000);
  });

  it('freezes elapsed on stop and ignores later time (no drift on a live tab)', () => {
    clock.set(0);
    sw.start();
    clock.set(2000);
    sw.stop();
    expect(sw.running).toBe(false);
    clock.set(9999);
    expect(sw.elapsedMs()).toBe(2000);
  });

  it('reset() returns to the un-started state', () => {
    clock.set(0);
    sw.start();
    clock.set(2000);
    sw.stop();
    sw.reset();
    expect(sw.started).toBe(false);
    expect(sw.elapsedMs()).toBe(0);
  });
});

describe('formatTime', () => {
  it('formats sub-minute times as M:SS.t', () => {
    expect(formatTime(0)).toBe('0:00.0');
    expect(formatTime(7300)).toBe('0:07.3');
    expect(formatTime(59900)).toBe('0:59.9');
  });

  it('rolls over into minutes', () => {
    expect(formatTime(60000)).toBe('1:00.0');
    expect(formatTime(83400)).toBe('1:23.4');
  });

  it('clamps negatives to zero (a hair over a time limit never shows -0)', () => {
    expect(formatTime(-500)).toBe('0:00.0');
  });
});
