// Headless game session (M4). Bundles the pure GameState with a wall-clock
// Stopwatch and the restart / next-level flow, so scoring and timing live in one
// clock-injected, DOM-free place the unit tests can drive directly. The app layer
// (game/app) is then just this session + renderer + input wiring.
//
// Rules added here on top of the M1 model:
//  - timer start policy (level config: start on first move vs. on load, §2);
//  - the time-limit fail (§2): exceeding a level's optional limit is a hard loss,
//    enforced on every move and every UI tick (it's clock-driven, so it can fire
//    with no input — see `tick`);
//  - restart replays the *same* level; advance loads the *next* one after a win.

import {
  createGame,
  fail,
  levelConfig,
  move,
  moveTo,
  Stopwatch,
  systemClock,
  type CellId,
  type Clock,
  type FailReason,
  type GameState,
  type GameStatus,
  type InputDirection,
  type Level,
  type MoveOutcome,
} from '../model/index.ts';

export type { FailReason };

export interface SessionOptions {
  /** Time source for scoring; defaults to the real system clock. */
  readonly clock?: Clock;
  /**
   * Produce the level to play *after a win*. Omitted → "advance" replays the same
   * level. Called once per advance, so it may return a fresh random level.
   */
  readonly nextLevel?: () => Level;
}

/**
 * A single-player run of a sequence of levels. Not immutable (unlike the core
 * GameState it wraps): it is the mutable UI-facing controller, but every timing
 * decision is delegated to an injected clock, so it stays deterministic in tests.
 */
export class GameSession {
  private _level: Level;
  private _state: GameState;
  private _failReason: FailReason | undefined;
  private readonly timer: Stopwatch;
  private readonly nextLevelFactory: (() => Level) | undefined;

  constructor(level: Level, options: SessionOptions = {}) {
    this.timer = new Stopwatch(options.clock ?? systemClock);
    this.nextLevelFactory = options.nextLevel;
    this._level = level;
    this._state = this.begin(level);
  }

  get level(): Level {
    return this._level;
  }

  get state(): GameState {
    return this._state;
  }

  get status(): GameStatus {
    return this._state.status;
  }

  /** Set only when `status === 'lost'`: what caused the loss. */
  get failReason(): FailReason | undefined {
    return this._failReason;
  }

  /** Milliseconds on the clock: 0 before the first move, live, then frozen on finish. */
  elapsedMs(): number {
    return this.timer.elapsedMs();
  }

  /** This level's time limit in ms, or undefined if untimed. */
  timeLimitMs(): number | undefined {
    return levelConfig(this._level).timeLimitMs;
  }

  /** Time left before the limit fail, or undefined if untimed. Clamped at 0. */
  remainingMs(): number | undefined {
    const limit = this.timeLimitMs();
    if (limit === undefined) return undefined;
    return Math.max(0, limit - this.timer.elapsedMs());
  }

  /**
   * Advance a UI frame's worth of time. Enforces the time-limit fail even with no
   * player input (the clock keeps running on a backgrounded tab — §2), so the app
   * calls this from its animation loop as well as before each move.
   */
  tick(): void {
    if (this._state.status !== 'playing') return;
    const limit = this.timeLimitMs();
    if (limit === undefined || !this.timer.running) return;
    if (this.timer.elapsedMs() >= limit) {
      this._state = fail(this._state);
      this._failReason = 'timeout';
      this.timer.stop();
    }
  }

  /**
   * Attempt one move. Starts the clock on the first successful move (the default
   * "start on first move" policy — a load-timed level is already running). Returns
   * the model's MoveOutcome; a timed-out or finished game reports `blocked`.
   */
  move(input: InputDirection): MoveOutcome {
    this.tick(); // a pending timeout fails the run before this move can land
    if (this._state.status !== 'playing') return 'blocked';

    const result = move(this._state, input);
    if (result.outcome === 'blocked') return 'blocked';

    return this.applyResult(result.state, result.outcome);
  }

  /**
   * Attempt to move straight onto `target` (click/tap-to-move, hexagonal.md §2.6):
   * legal only when `target` is a current neighbour, otherwise `blocked` with no
   * effect. Shares the exact timing/fail bookkeeping as `move` — a tap and a key
   * press are the same move as far as the clock and the win/loss rules are concerned.
   */
  moveTo(target: CellId): MoveOutcome {
    this.tick(); // a pending timeout fails the run before this move can land
    if (this._state.status !== 'playing') return 'blocked';

    const result = moveTo(this._state, target);
    if (result.outcome === 'blocked') return 'blocked';

    return this.applyResult(result.state, result.outcome);
  }

  /** Commit a non-blocked move result: start/stop the clock and record a loss cause. */
  private applyResult(state: GameState, outcome: MoveOutcome): MoveOutcome {
    this.timer.start(); // idempotent: first-move start; no-op once running
    this._state = state;
    if (this._state.status === 'lost') {
      this._failReason = 'crash';
      this.timer.stop();
    } else if (this._state.status === 'won') {
      this.timer.stop();
    }
    return outcome;
  }

  /** Restart the current level (instant retry — §4). Resets the clock. */
  restart(): void {
    this._state = this.begin(this._level);
  }

  /**
   * Switch to an arbitrary level and start a fresh game + clock (M5 seed entry:
   * loading a pasted/shared level code mid-run). Independent of the win-only
   * next-level factory used by `advance`.
   */
  load(level: Level): void {
    this._level = level;
    this._state = this.begin(level);
  }

  /**
   * Continue after a finished run: load the next level after a win (if a factory
   * was given), otherwise just restart the current one. From a loss this is a
   * retry. A no-op while still playing.
   */
  advance(): void {
    if (this._state.status === 'playing') return;
    if (this._state.status === 'won' && this.nextLevelFactory) {
      this._level = this.nextLevelFactory();
    }
    this._state = this.begin(this._level);
  }

  /** Fresh game + clock for a level, applying its timer-start policy. */
  private begin(level: Level): GameState {
    this.timer.reset();
    this._failReason = undefined;
    const state = createGame(level);
    if (levelConfig(level).timerStart === 'load') this.timer.start();
    // A level that is already complete on load (edge case) freezes at ~0.
    if (state.status !== 'playing') this.timer.stop();
    return state;
  }
}
