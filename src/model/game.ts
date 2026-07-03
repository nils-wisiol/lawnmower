// Core game logic (M1): move validation, mow tracking, win/fail detection.
// Pure, geometry-agnostic functions over the abstract cell graph — no rendering,
// no input handling, no clock. Every rule reads cell *traits*, never a tile enum.

import { countMowable, traitsOf, type CellId, type InputDirection, type Level } from './types.ts';

export type GameStatus = 'playing' | 'won' | 'lost';

/**
 * Why a lost run ended: a re-mow `crash`, or the time limit running out (`timeout`,
 * lawnmower.md §2). Lives beside GameStatus so both the timing session and the
 * renderer can name it without depending on each other.
 */
export type FailReason = 'crash' | 'timeout';

/**
 * Immutable snapshot of a game in progress. `move` returns a fresh state rather
 * than mutating, keeping the core trivially testable and replayable.
 */
export interface GameState {
  readonly level: Level;
  /** The mower's current cell. */
  readonly position: CellId;
  /** Mowable cells that have been mowed so far. */
  readonly mowed: ReadonlySet<CellId>;
  readonly status: GameStatus;
  /** Total mowable cells in the level; the game is won when all are mowed. */
  readonly totalMowable: number;
}

/** What a single `move` attempt did, for the caller (renderer/input) to react to. */
export type MoveOutcome =
  /** Mower advanced into a passable cell (possibly mowing it). */
  | 'moved'
  /** Input rejected: no such direction, board edge, or an impassable cell. No state change. */
  | 'blocked'
  /** The move mowed the final mowable cell — level complete. */
  | 'won'
  /** Hard fail: the move re-entered an already-mowed mowable cell. */
  | 'lost';

export interface MoveResult {
  readonly state: GameState;
  readonly outcome: MoveOutcome;
}

/** Begin a game. The mower occupies `start`, mowing it if it is mowable. */
export function createGame(level: Level): GameState {
  const startTraits = traitsOf(level, level.start);
  if (!startTraits.passable) {
    throw new Error(`Level start "${level.start}" is not passable`);
  }
  const totalMowable = countMowable(level);
  const mowed = new Set<CellId>();
  if (startTraits.mowable) mowed.add(level.start);
  return {
    level,
    position: level.start,
    mowed,
    status: mowed.size === totalMowable ? 'won' : 'playing',
    totalMowable,
  };
}

/**
 * Attempt one move in the given input direction. Returns the next state and an
 * outcome. Rules (lawnmower.md §2):
 *  - only *passable* cells may be entered (else `blocked`, no state change);
 *  - entering an unmowed *mowable* cell mows it (may `win`);
 *  - re-entering an already-mowed *mowable* cell is a hard `lost` fail;
 *  - a passable-but-not-mowable cell may be crossed freely, any number of times.
 */
export function move(state: GameState, input: InputDirection): MoveResult {
  if (state.status !== 'playing') {
    return { state, outcome: 'blocked' };
  }

  const { level } = state;
  const direction = level.topology.directionForInput(input);
  if (direction === undefined) {
    return { state, outcome: 'blocked' };
  }

  const target = level.topology.neighbor(state.position, direction);
  if (target === undefined) {
    return { state, outcome: 'blocked' }; // board edge / no neighbor
  }

  const traits = traitsOf(level, target);
  if (!traits.passable) {
    return { state, outcome: 'blocked' }; // obstacle
  }

  // Passable-but-not-mowable (e.g. a path): cross freely, never mow, never fail.
  if (!traits.mowable) {
    return {
      state: { ...state, position: target },
      outcome: 'moved',
    };
  }

  // Mowable cell already mowed → hard fail. Move the mower onto it so the caller
  // can show *where* the revisit happened, then mark the game lost.
  if (state.mowed.has(target)) {
    return {
      state: { ...state, position: target, status: 'lost' },
      outcome: 'lost',
    };
  }

  // Fresh mowable cell: mow it.
  const mowed = new Set(state.mowed);
  mowed.add(target);
  const won = mowed.size === state.totalMowable;
  return {
    state: {
      ...state,
      position: target,
      mowed,
      status: won ? 'won' : 'playing',
    },
    outcome: won ? 'won' : 'moved',
  };
}

/**
 * Force a running game into a loss without a move. Used for the time-limit fail
 * (lawnmower.md §2), which is clock-driven rather than move-driven — so it lives
 * outside `move`. No-op once the game is already finished.
 */
export function fail(state: GameState): GameState {
  return state.status === 'playing' ? { ...state, status: 'lost' } : state;
}

/** Cells still needing to be mowed. Empty iff the level is won. */
export function remainingMowable(state: GameState): CellId[] {
  const remaining: CellId[] = [];
  for (const cell of state.level.topology.cells) {
    if (traitsOf(state.level, cell).mowable && !state.mowed.has(cell)) {
      remaining.push(cell);
    }
  }
  return remaining;
}
