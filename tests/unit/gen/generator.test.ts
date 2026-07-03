import { describe, expect, it } from 'vitest';

import {
  countMowable,
  createGame,
  levelConfig,
  move,
  traitsOf,
  type CellId,
  type InputDirection,
  type Level,
} from '../../../src/model/index.ts';
import { generate, generateLevel, type GeneratorConfig } from '../../../src/gen/index.ts';

const BASE: GeneratorConfig = { seed: 12345, width: 10, height: 8, coverage: 0.6 };

/**
 * Replay a self-avoiding walk through the real game rules and return the final
 * state. Geometry-agnostic: for each step it discovers which input reaches the
 * next cell, so this works for any Topology, not just square grids.
 */
function playWalk(level: Level, walk: readonly CellId[]) {
  const inputs: InputDirection[] = ['up', 'down', 'left', 'right'];
  let state = createGame(level);
  for (let i = 1; i < walk.length; i++) {
    const target = walk[i];
    const step = inputs
      .map((input) => move(state, input))
      .find((r) => r.state.position === target && r.outcome !== 'lost');
    if (step === undefined) {
      throw new Error(`Walk step ${i} to "${target}" was not reachable by any input`);
    }
    state = step.state;
  }
  return state;
}

describe('generate — solvable by construction (M3 done-criterion)', () => {
  it('the generating walk is itself a perfect mow that wins the level', () => {
    const { level, walk } = generate(BASE);
    // The walk visits every mowable cell exactly once…
    expect(walk.length).toBe(countMowable(level));
    expect(new Set(walk).size).toBe(walk.length); // no repeats
    // …and replaying it through the actual rules reaches a win.
    const final = playWalk(level, walk);
    expect(final.status).toBe('won');
  });

  it('the start is the walk head and is passable + mowable', () => {
    const { level, walk } = generate(BASE);
    expect(level.start).toBe(walk[0]);
    expect(traitsOf(level, level.start)).toEqual({ passable: true, mowable: true });
  });
});

describe('generate — reproducibility', () => {
  it('same seed + config yields an identical level and walk', () => {
    const a = generate(BASE);
    const b = generate(BASE);
    expect(a.walk).toEqual(b.walk);
    expect(a.level.start).toBe(b.level.start);
    // Traits match cell-for-cell.
    for (const cell of a.level.topology.cells) {
      expect(traitsOf(a.level, cell)).toEqual(traitsOf(b.level, cell));
    }
  });

  it('different seeds generally yield different levels', () => {
    const a = generate({ ...BASE, seed: 1 });
    const b = generate({ ...BASE, seed: 2 });
    expect(a.walk).not.toEqual(b.walk);
  });
});

describe('generate — gaps become obstacles', () => {
  it('every cell is either walked grass or an obstacle, and grass == the walk', () => {
    const { level, walk } = generate(BASE);
    const walked = new Set(walk);
    for (const cell of level.topology.cells) {
      const t = traitsOf(level, cell);
      if (walked.has(cell)) {
        expect(t).toEqual({ passable: true, mowable: true });
      } else {
        expect(t).toEqual({ passable: false, mowable: false });
      }
    }
    // Grass cells are exactly the walked cells.
    const grass = level.topology.cells.filter((c) => traitsOf(level, c).mowable);
    expect(grass.length).toBe(walk.length);
  });
});

describe('generate — coverage floor', () => {
  it('meets or exceeds the requested coverage floor', () => {
    for (const seed of [1, 2, 3, 100, 999]) {
      const result = generate({ ...BASE, seed, coverage: 0.6 });
      expect(result.coverage).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('reports coverage as mowable / total cells', () => {
    const { level, coverage } = generate(BASE);
    const total = level.topology.cells.length;
    expect(coverage).toBeCloseTo(countMowable(level) / total);
  });
});

describe('generate — time limit', () => {
  it('budgets 0.5s per move of the perfect mow (walk length - 1 steps)', () => {
    const { level, walk } = generate(BASE);
    // The start is mowed for free, so the solution is walk.length - 1 moves.
    expect(levelConfig(level).timeLimitMs).toBe((walk.length - 1) * 500);
  });

  it('starts the clock on the first move (free planning time)', () => {
    const { level } = generate(BASE);
    expect(levelConfig(level).timerStart).toBe('firstMove');
  });
});

describe('generate — validation', () => {
  it('rejects non-positive or non-integer sizes', () => {
    expect(() => generateLevel({ ...BASE, width: 0 })).toThrow(/positive/);
    expect(() => generateLevel({ ...BASE, height: -3 })).toThrow(/positive/);
    expect(() => generateLevel({ ...BASE, width: 2.5 })).toThrow(/positive/);
  });

  it('rejects coverage outside (0, 1]', () => {
    expect(() => generateLevel({ ...BASE, coverage: 0 })).toThrow(/coverage/);
    expect(() => generateLevel({ ...BASE, coverage: 1.5 })).toThrow(/coverage/);
  });
});
