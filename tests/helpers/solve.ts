// Test-only solving helpers. `findSolution` brute-forces a winning input sequence
// by DFS over game states (used to prove the small demo level solvable); because
// `move` is pure, backtracking is just "don't keep the branch". `walkToInputs`
// turns a generator walk into the inputs that replay it — cheap where brute force
// would explode, and what drives the e2e playthrough of the generated level.

import {
  createGame,
  move,
  type CellId,
  type InputDirection,
  type Level,
} from '../../src/model/index.ts';
import type { GameState } from '../../src/model/index.ts';

// The full intent superset (hexagonal.md §2.2): the four square cardinals plus the
// four hex diagonals. A topology ignores the intents it doesn't map, so this one list
// drives both a square and a hex board — the 6-way keys that let solve.ts replay a hex
// walk landed with H2.
const INPUTS: readonly InputDirection[] = [
  'up',
  'down',
  'left',
  'right',
  'upLeft',
  'upRight',
  'downLeft',
  'downRight',
];

/**
 * Convert a self-avoiding walk (consecutive cells) into the input sequence that
 * walks it. Geometry-agnostic: for each step it asks the model which input reaches
 * the next cell, so it works for any Topology. The generator's walk is a perfect
 * mow, so the returned inputs drive the level to a win.
 */
export function walkToInputs(level: Level, walk: readonly CellId[]): InputDirection[] {
  let state = createGame(level);
  const inputs: InputDirection[] = [];
  for (let i = 1; i < walk.length; i++) {
    const target = walk[i];
    const input = INPUTS.find((candidate) => {
      const result = move(state, candidate);
      return result.state.position === target && result.outcome !== 'lost';
    });
    if (input === undefined) {
      throw new Error(`Walk step ${i} to "${target}" is unreachable by any input`);
    }
    inputs.push(input);
    state = move(state, input).state;
  }
  return inputs;
}

/** Return a winning input sequence for `level`, or undefined if none exists. */
export function findSolution(level: Level): InputDirection[] | undefined {
  const start = createGame(level);
  const path: InputDirection[] = [];
  // Guard against re-expanding a cell we're already standing on in this branch is
  // unnecessary: the game's revisit rule already prunes cycles for us (re-mowing
  // fails), so plain DFS terminates.
  const search = (state: GameState): boolean => {
    if (state.status === 'won') return true;
    if (state.status === 'lost') return false;
    for (const input of INPUTS) {
      const result = move(state, input);
      if (result.outcome === 'blocked') continue; // illegal, no progress
      path.push(input);
      if (search(result.state)) return true;
      path.pop();
    }
    return false;
  };
  return search(start) ? path : undefined;
}
