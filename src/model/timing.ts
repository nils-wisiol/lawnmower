// Timing & scoring primitives (lawnmower.md §2 scoring, §5 injected clock). The
// primary score is wall-clock completion time, so time is read through an INJECTED
// Clock — never `Date.now()` directly in game logic. That keeps non-deterministic
// wall-clock scoring deterministically testable: unit tests drive a fake clock,
// the browser wires the real one. This module is pure logic (no DOM, no rendering).

/** A source of the current time in milliseconds. The one seam over system time. */
export interface Clock {
  now(): number;
}

/**
 * The real clock, backed by `Date.now()`. This is the ONLY place game/scoring code
 * is allowed to touch system time (§5); everything else takes a Clock.
 */
export const systemClock: Clock = { now: () => Date.now() };

/**
 * A start/stop stopwatch over an injected clock. Backs both the completion-time
 * score and the optional per-level time limit. Deliberately tolerant so the app's
 * "start on first move" is a plain idempotent `start()`:
 *  - `start()` after already started is a no-op (keeps the original start time);
 *  - `stop()` freezes elapsed at the stop instant, so a finished run's time is
 *    stable no matter how much later it is read (the tab may keep running — §2:
 *    focus loss does NOT pause, and a frozen time doesn't drift).
 */
export class Stopwatch {
  private startedAt: number | undefined;
  private stoppedAt: number | undefined;

  constructor(private readonly clock: Clock) {}

  /** True once `start()` has run (and before a `reset()`). */
  get started(): boolean {
    return this.startedAt !== undefined;
  }

  /** True while ticking: started and not yet stopped. */
  get running(): boolean {
    return this.startedAt !== undefined && this.stoppedAt === undefined;
  }

  /** Begin ticking. Idempotent, so "start on first move" can call it every move. */
  start(): void {
    if (this.startedAt === undefined) this.startedAt = this.clock.now();
  }

  /** Freeze elapsed time (on win/fail). No-op if not currently running. */
  stop(): void {
    if (this.running) this.stoppedAt = this.clock.now();
  }

  /** Return to the un-started state, for a level restart. */
  reset(): void {
    this.startedAt = undefined;
    this.stoppedAt = undefined;
  }

  /** Milliseconds elapsed: 0 before start, live while running, frozen after stop. */
  elapsedMs(): number {
    if (this.startedAt === undefined) return 0;
    return (this.stoppedAt ?? this.clock.now()) - this.startedAt;
  }
}

/**
 * Format a millisecond duration as `M:SS.t` (e.g. `1:07.4`), for the on-board timer
 * and the win screen. Tenths of a second are enough resolution for a HUD without
 * jitter; clamps negatives to zero so a slightly-over time limit never shows `-0`.
 */
export function formatTime(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((clamped % 1000) / 100);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
}
