import { describe, expect, it } from 'vitest';

import {
  countMowable,
  createGame,
  decorOf,
  levelConfig,
  move,
  moveTo,
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

// Hex is added as a *new* topology handed to the same generator; the walk/scatter/
// decor code is geometry-agnostic, so a hex config must produce an equally solvable,
// deterministic level. Driven cell-by-cell via moveTo (the 6-way key intents land in H2).
describe('generate — hex geometry (H1)', () => {
  const HEX: GeneratorConfig = { ...BASE, shape: 'hex' };

  /** Replay a walk through the real rules using cell-driven moveTo (any geometry). */
  function playWalkByCell(level: Level, walk: readonly CellId[]) {
    let state = createGame(level);
    for (let i = 1; i < walk.length; i++) {
      const step = moveTo(state, walk[i]);
      if (step.outcome === 'blocked') {
        throw new Error(`Walk step ${i} to "${walk[i]}" was not a legal neighbour`);
      }
      state = step.state;
    }
    return state;
  }

  it('produces a solvable hex level whose generating walk is a perfect mow', () => {
    const { level, walk } = generate(HEX);
    expect(walk.length).toBe(countMowable(level));
    expect(new Set(walk).size).toBe(walk.length); // no repeats
    const final = playWalkByCell(level, walk);
    expect(final.status).toBe('won');
  });

  it('meets the coverage floor and is reproducible per seed', () => {
    for (const seed of [1, 2, 3, 12345, 999]) {
      const a = generate({ ...HEX, seed });
      const b = generate({ ...HEX, seed });
      expect(a.coverage).toBeGreaterThanOrEqual(HEX.coverage);
      expect(a.walk).toEqual(b.walk); // deterministic
    }
  });

  it('is a genuinely different board from the square level for the same seed', () => {
    const square = generate(BASE);
    const hex = generate(HEX);
    // Same seed, different geometry → the walks differ (guards against shape being ignored).
    expect(hex.walk).not.toEqual(square.walk);
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

// Water should read as real ponds — connected bodies — not a uniform sprinkle of
// single tiles across the obstacles. The generator clusters it; these lock that in.
describe('generate — water forms connected bodies (not uniform noise)', () => {
  const SEEDS = [1, 2, 3, 12345, 999, 42, 7, 100];

  // "Wet" = plain water or a fountain standing in water: both form the body and both
  // count as a shore-neighbour, so a fountain in a pond doesn't read as a hole.
  const isWet = (level: Level, cell: CellId): boolean => {
    const d = decorOf(level, cell);
    return d === 'water' || d === 'water-fountain';
  };

  /** Orthogonal wet neighbours of `cell`. */
  function waterNeighbours(level: Level, cell: CellId): CellId[] {
    const out: CellId[] = [];
    for (const dir of level.topology.directions) {
      const n = level.topology.neighbor(cell, dir);
      if (n !== undefined && isWet(level, n)) out.push(n);
    }
    return out;
  }

  const waterCells = (level: Level): CellId[] =>
    level.topology.cells.filter((c) => isWet(level, c));

  /** Sizes of the connected (orthogonal) water bodies, largest first. */
  function bodySizes(level: Level): number[] {
    const water = new Set(waterCells(level));
    const seen = new Set<CellId>();
    const sizes: number[] = [];
    for (const start of water) {
      if (seen.has(start)) continue;
      let size = 0;
      const stack = [start];
      seen.add(start);
      while (stack.length > 0) {
        const c = stack.pop() as CellId;
        size++;
        for (const n of waterNeighbours(level, c)) {
          if (!seen.has(n)) {
            seen.add(n);
            stack.push(n);
          }
        }
      }
      sizes.push(size);
    }
    return sizes.sort((a, b) => b - a);
  }

  it('assigns a garden decor to exactly the obstacle cells', () => {
    const kinds = ['water', 'tree', 'flower', 'water-fountain', 'lawn-fountain'];
    const { level } = generate(BASE);
    for (const cell of level.topology.cells) {
      const isObstacle = !traitsOf(level, cell).passable;
      const decor = decorOf(level, cell);
      if (isObstacle) {
        expect(decor).toBeDefined();
        expect(kinds).toContain(decor);
      } else {
        expect(decor).toBeUndefined();
      }
    }
  });

  it('never leaves a lone water tile — every water cell touches another (a body of ≥2)', () => {
    for (const seed of SEEDS) {
      const { level } = generate({ ...BASE, seed });
      for (const cell of waterCells(level)) {
        expect(waterNeighbours(level, cell).length).toBeGreaterThan(0);
      }
    }
  });

  it('grows water into sizeable bodies rather than scattering single tiles', () => {
    // Pooled across seeds: the largest body on a typical board is many tiles, and the
    // mean body is well above the ~1.3 a uniform-random sprinkle at this density gives.
    let biggest = 0;
    let cells = 0;
    let bodies = 0;
    for (const seed of SEEDS) {
      const sizes = bodySizes(generate({ ...BASE, seed }).level);
      if (sizes.length === 0) continue;
      biggest = Math.max(biggest, sizes[0]);
      cells += sizes.reduce((a, b) => a + b, 0);
      bodies += sizes.length;
    }
    expect(biggest).toBeGreaterThanOrEqual(8); // at least one proper lake
    expect(cells / bodies).toBeGreaterThanOrEqual(3); // bodies average ≥3 tiles
  });

  it('places water fountains only on interior water tiles (surrounded by water)', () => {
    // A water fountain must be embedded in a body — all four neighbours wet — so it
    // reads as standing in a pond and never breaks the shoreline.
    for (const seed of SEEDS) {
      const { level } = generate({ ...BASE, seed });
      for (const cell of level.topology.cells) {
        if (decorOf(level, cell) === 'water-fountain') {
          expect(waterNeighbours(level, cell).length).toBe(level.topology.directions.length);
        }
      }
    }
  });

  it('does produce fountains of both kinds across seeds (the feature is live)', () => {
    // Fountains are rare, so pool across seeds/sizes to reliably see each kind.
    let water = 0;
    let lawn = 0;
    for (const seed of [...SEEDS, 55, 88, 123, 777]) {
      const { level } = generate({ ...BASE, seed, width: 12, height: 9 });
      for (const cell of level.topology.cells) {
        const d = decorOf(level, cell);
        if (d === 'water-fountain') water++;
        if (d === 'lawn-fountain') lawn++;
      }
    }
    expect(water).toBeGreaterThan(0);
    expect(lawn).toBeGreaterThan(0);
  });

  it('is reproducible per seed (decor matches cell-for-cell)', () => {
    const a = generate(BASE).level;
    const b = generate(BASE).level;
    for (const cell of a.topology.cells) {
      expect(decorOf(a, cell)).toBe(decorOf(b, cell));
    }
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

  it('doubles the per-move budget to 1s on hex (6-way movement is less familiar)', () => {
    const { level, walk } = generate({ ...BASE, shape: 'hex' });
    expect(levelConfig(level).timeLimitMs).toBe((walk.length - 1) * 1000);
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
