// Test-only brute-force solver: finds a winning sequence of inputs for a level by
// DFS over game states, backtracking on blocked/lost moves. Because `move` is pure
// and returns fresh state, backtracking is just "don't keep the branch". Used to
// verify the demo level is solvable and to drive the e2e playthrough with a real,
// discovered solution (no hand-routed, possibly-wrong key list).

import { createGame, move, type InputDirection, type Level } from '../../src/model/index.ts';
import type { GameState } from '../../src/model/index.ts';

const INPUTS: readonly InputDirection[] = ['up', 'down', 'left', 'right'];

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
