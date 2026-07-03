import { describe, expect, it } from 'vitest';

import { levelFromAscii, countMowable, traitsOf } from '../../../src/model/index.ts';
import { DEMO_LEVEL_MAP } from '../../../src/game/demoLevel.ts';
import { findSolution } from '../../helpers/solve.ts';

describe('demo level (M2 hardcoded playable level)', () => {
  it('parses to a level with a fixed passable start', () => {
    const level = levelFromAscii(DEMO_LEVEL_MAP);
    expect(traitsOf(level, level.start).passable).toBe(true);
  });

  it('has obstacles, so routing is non-trivial', () => {
    const level = levelFromAscii(DEMO_LEVEL_MAP);
    const obstacles = level.topology.cells.filter((c) => !traitsOf(level, c).passable);
    expect(obstacles.length).toBeGreaterThan(0);
    // Not every tile is mowable — the obstacles genuinely remove coverage.
    expect(countMowable(level)).toBeLessThan(level.topology.cells.length);
  });

  it('has a perfect mow (is solvable) — the M2 done-criterion', () => {
    const level = levelFromAscii(DEMO_LEVEL_MAP);
    const solution = findSolution(level);
    expect(solution).toBeDefined();
    expect(solution!.length).toBe(countMowable(level) - 1); // one move per new tile after start
  });
});
