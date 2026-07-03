import { describe, expect, it } from 'vitest';

import { countMowable, traitsOf } from '../../../src/model/index.ts';
import { levelFromCode } from '../../../src/game/defaultLevel.ts';
import { TUTORIAL_CODE, tutorialLevel } from '../../../src/game/tutorial.ts';
import { findSolution } from '../../helpers/solve.ts';

describe('tutorial level (M6 onboarding)', () => {
  it('has a perfect mow — a first-timer can actually finish it', () => {
    const { level } = tutorialLevel();
    const solution = findSolution(level);
    expect(solution).toBeDefined();
    expect(solution!.length).toBe(countMowable(level) - 1);
  });

  it('teaches routing: it has obstacles and a passable start', () => {
    const { level } = tutorialLevel();
    expect(traitsOf(level, level.start).passable).toBe(true);
    const obstacles = level.topology.cells.filter((c) => !traitsOf(level, c).passable);
    expect(obstacles.length).toBeGreaterThan(0);
  });

  it('carries the reserved code so it is shareable/reachable by code', () => {
    expect(tutorialLevel().code).toBe(TUTORIAL_CODE);
  });

  it('is reachable via the reserved code through the normal decode path', () => {
    const coded = levelFromCode(TUTORIAL_CODE);
    expect(coded.code).toBe(TUTORIAL_CODE);
    // Same lawn as loading it directly (so #tutorial and pasting `tutorial` agree).
    expect(countMowable(coded.level)).toBe(countMowable(tutorialLevel().level));
  });
});
