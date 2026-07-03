// Seeded level generator (M3). Builds a solvable level in three steps:
//   1. scatter a few obstacles at random cells (garden features — the walk must
//      route around them, so they appear *within* the lawn, not just as leftovers);
//   2. carve a self-avoiding walk (SAW) across the remaining cells, stopping once
//      it has mowed the target number of cells;
//   3. turn every still-unwalked cell into an obstacle too.
// The walk itself is a guaranteed perfect mow, so every generated level is solvable
// *by construction* (lawnmower.md §5, §6) — we never touch the NP-hard "decide if
// solvable" problem the player faces. Step 1 is what makes obstacles read as
// scattered garden features rather than one contiguous corner blob.
//
// The walk operates on the abstract Topology (neighbour function + direction set),
// not on square coordinates, so a future hex/teleport board reuses this generator
// unchanged (lawnmower.md §5 "generator also targets the abstract graph").

import {
  HexGrid,
  SquareGrid,
  type CellId,
  type CellTraits,
  type Decor,
  type Level,
  type Topology,
} from '../model/index.ts';
import { createRng, type Rng } from './rng.ts';

/**
 * Board geometry to generate. The whole generator is written against the abstract
 * Topology (neighbour + direction set), so this only chooses which topology to hand
 * it — the walk/scatter/decor code is identical for both. Defaults to `square`, which
 * leaves the original generation path byte-for-byte unchanged (hexagonal.md §2.5).
 */
export type GridShape = 'square' | 'hex';

/** Inputs to the generator: seed picks the level, size + coverage set difficulty. */
export interface GeneratorConfig {
  /** RNG seed; the same seed reproduces the same level. */
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  /**
   * Target fraction of cells that become mowable grass; the rest become obstacles,
   * so `1 - coverage` is the obstacle density — the difficulty knob (lawnmower.md
   * §2). In (0, 1]. Acts as a floor: the walk stops once it reaches this many
   * cells, so coverage lands just at/above it rather than racing to a full
   * Hamiltonian cover (which would leave no obstacles at all).
   */
  readonly coverage: number;
  /** Board geometry; defaults to `square` (the original, unchanged path). */
  readonly shape?: GridShape;
}

/** A generated level plus the walk that proves it solvable (the perfect mow). */
export interface GeneratedLevel {
  readonly level: Level;
  /** The self-avoiding walk, in visit order. `walk[0]` is the level start. */
  readonly walk: readonly CellId[];
  /** Fraction of board cells the walk covered (mowable / total). */
  readonly coverage: number;
}

const GRASS: CellTraits = { passable: true, mowable: true };
const OBSTACLE: CellTraits = { passable: false, mowable: false };

/**
 * How many walks to attempt before giving up on the coverage floor. Each attempt
 * consumes fresh RNG draws, so failures/successes stay deterministic per seed.
 * The Warnsdorff heuristic below makes near-full coverage typical, so this is a
 * safety net, rarely exhausted.
 */
const MAX_ATTEMPTS = 64;

/**
 * Fraction of cells pre-scattered as obstacles before the walk (step 1). Kept
 * small: a few scattered features give the level garden character and force the
 * walk to route around them, while leaving enough open board that the walk still
 * reliably reaches the coverage target. Tuned by experiment — pushing this higher
 * fragments the board and the greedy walk starts stranding cells short of target.
 */
const SCATTER_DENSITY = 0.05;

/**
 * Chance of taking a fully-random step instead of the Warnsdorff-preferred one.
 * A dash of randomness keeps walks varied per seed; kept low so the heuristic
 * still reliably reaches the coverage target around the scattered obstacles.
 */
const RANDOM_STEP_PROBABILITY = 0.15;

/**
 * Default time budget per step of the perfect mow (lawnmower.md §2 time limit). The
 * generated level's limit scales with its solution length — a bigger lawn gets
 * proportionally more time — at half a second per move on a square board. Time-
 * limit *sourcing* is an open question (§10); this per-step scaling is the first cut.
 *
 * Hex gets double the budget (1s/step): six-way movement with the newer Q/E/Z/C keys
 * is less familiar than four arrows, so each move takes longer to plan and aim.
 */
const MS_PER_STEP: Record<GridShape, number> = { square: 500, hex: 1000 };

/**
 * Water-body generation (lawnmower.md §3). Real ponds are connected, not a uniform
 * sprinkle of single tiles, so we don't decide each obstacle's kind independently.
 * Instead we scatter a few water *seeds* among the obstacles, then grow each seed
 * outward into adjacent obstacles over a couple of rounds — so water accretes into
 * connected bodies. Any water cell left orphaned (no orthogonal water neighbour) is
 * demoted back to a plant, guaranteeing every water tile belongs to a body of ≥2
 * (which is also what makes the water-edge tiles well-defined for the renderer).
 */
const WATER_SEED_FRACTION = 0.22;
const WATER_GROWTH_ROUNDS = 2;
const WATER_GROWTH_PROBABILITY = 0.5;

/** Of the non-water obstacles, the share drawn as trees; the rest are flowers. */
const TREE_FRACTION = 0.6;

/**
 * Fountains are rare focal features (lawnmower.md §3), not scattered everywhere. A
 * water fountain only replaces an *interior* water tile (one surrounded by water on
 * all four sides), so it reads as standing in a pond and — counting as water for the
 * shoreline — never punches a hole in the bank. A lawn fountain occasionally stands
 * in for a plant. Both are purely cosmetic decor.
 */
const WATER_FOUNTAIN_PROBABILITY = 0.2;
const LAWN_FOUNTAIN_PROBABILITY = 0.05;

/** Orthogonal neighbours of `cell` that lie within `within`. */
function neighboursIn(topology: Topology, cell: CellId, within: ReadonlySet<CellId>): CellId[] {
  const result: CellId[] = [];
  for (const dir of topology.directions) {
    const n = topology.neighbor(cell, dir);
    if (n !== undefined && within.has(n)) result.push(n);
  }
  return result;
}

/**
 * Decide each obstacle's visual kind, clustering water into connected bodies (see
 * WATER_SEED_FRACTION). Purely cosmetic — traits are untouched — so this runs after
 * the walk and consumes RNG only at the end, leaving the walk itself unchanged for a
 * given seed. Iterating `obstacles` in a fixed order keeps the result deterministic.
 */
function assignDecor(
  topology: Topology,
  obstacles: readonly CellId[],
  rng: Rng,
): Map<CellId, Decor> {
  const obstacleSet = new Set(obstacles);
  const water = new Set<CellId>();

  // Seed a sparse set of water tiles…
  for (const cell of obstacles) {
    if (rng.next() < WATER_SEED_FRACTION) water.add(cell);
  }
  // …then grow each seed into adjacent obstacles, so water accretes into bodies.
  // Additions are collected per round and applied together, giving even concentric
  // growth rather than a single pass racing along one direction.
  for (let round = 0; round < WATER_GROWTH_ROUNDS; round++) {
    const additions: CellId[] = [];
    for (const cell of obstacles) {
      if (water.has(cell)) continue;
      if (
        neighboursIn(topology, cell, obstacleSet).some((n) => water.has(n)) &&
        rng.next() < WATER_GROWTH_PROBABILITY
      ) {
        additions.push(cell);
      }
    }
    for (const cell of additions) water.add(cell);
  }
  // Demote orphaned water (a lone seed that never grew) so every water tile has a
  // water neighbour — no unrealistic one-tile puddles, and edge tiles stay well-defined.
  for (const cell of obstacles) {
    if (water.has(cell) && !neighboursIn(topology, cell, water).length) water.delete(cell);
  }

  const decor = new Map<CellId, Decor>();
  for (const cell of obstacles) {
    if (water.has(cell)) decor.set(cell, 'water');
    else decor.set(cell, rng.next() < TREE_FRACTION ? 'tree' : 'flower');
  }

  // Fountain pass (rare focal features). Water fountains only take interior water
  // tiles — all four neighbours water — so they stay embedded in a body and, still
  // counting as water, don't break its shoreline. Lawn fountains stand in for a plant.
  for (const cell of obstacles) {
    const kind = decor.get(cell);
    if (
      kind === 'water' &&
      neighboursIn(topology, cell, water).length === topology.directions.length &&
      rng.next() < WATER_FOUNTAIN_PROBABILITY
    ) {
      decor.set(cell, 'water-fountain');
    } else if ((kind === 'tree' || kind === 'flower') && rng.next() < LAWN_FOUNTAIN_PROBABILITY) {
      decor.set(cell, 'lawn-fountain');
    }
  }
  return decor;
}

/** Neighbours of `cell` that are neither blocked (obstacle) nor already visited. */
function openNeighbours(
  topology: Topology,
  cell: CellId,
  blocked: ReadonlySet<CellId>,
  visited: ReadonlySet<CellId>,
): CellId[] {
  const result: CellId[] = [];
  for (const dir of topology.directions) {
    const n = topology.neighbor(cell, dir);
    if (n !== undefined && !blocked.has(n) && !visited.has(n)) result.push(n);
  }
  return result;
}

/** Pick `k` distinct cells uniformly at random (partial Fisher–Yates shuffle). */
function sampleCells(cells: readonly CellId[], k: number, rng: Rng): Set<CellId> {
  const pool = cells.slice();
  const chosen = new Set<CellId>();
  for (let i = 0; i < k && i < pool.length; i++) {
    const j = i + rng.int(pool.length - i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
    chosen.add(pool[i]);
  }
  return chosen;
}

/**
 * Carve one self-avoiding walk from a random open start, avoiding `blocked` cells,
 * stopping once it has covered `stopAt` cells or dead-ends first. Mostly follows a
 * Warnsdorff-style heuristic — step to the neighbour with the fewest onward exits —
 * which avoids stranding cells and so reliably reaches `stopAt`; an occasional
 * random step (RANDOM_STEP_PROBABILITY) keeps levels varied per seed.
 */
function selfAvoidingWalk(
  topology: Topology,
  rng: Rng,
  blocked: ReadonlySet<CellId>,
  stopAt: number,
): CellId[] {
  const open = topology.cells.filter((c) => !blocked.has(c));
  if (open.length === 0) return [];

  const visited = new Set<CellId>();
  const start = rng.pick(open);
  visited.add(start);
  const walk: CellId[] = [start];

  let current = start;
  while (walk.length < stopAt) {
    const candidates = openNeighbours(topology, current, blocked, visited);
    if (candidates.length === 0) break;

    let nextCell: CellId;
    if (rng.next() < RANDOM_STEP_PROBABILITY) {
      nextCell = rng.pick(candidates);
    } else {
      // Score each candidate by its onward open-neighbour count; the fewer, the
      // more urgent to visit now (Warnsdorff). Keep all minima for a fair tie.
      let best = Infinity;
      let bestOnes: CellId[] = [];
      for (const c of candidates) {
        const onward = openNeighbours(topology, c, blocked, visited).length;
        if (onward < best) {
          best = onward;
          bestOnes = [c];
        } else if (onward === best) {
          bestOnes.push(c);
        }
      }
      nextCell = rng.pick(bestOnes);
    }

    visited.add(nextCell);
    walk.push(nextCell);
    current = nextCell;
  }

  return walk;
}

/** Validate config up front so failures are clear, not deep in the walk. */
function validate(config: GeneratorConfig): void {
  const { width, height, coverage } = config;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`Generator size must be positive integers, got ${width}x${height}`);
  }
  if (!(coverage > 0) || coverage > 1) {
    throw new Error(`Generator coverage must be in (0, 1], got ${coverage}`);
  }
}

/**
 * Generate a solvable level from a config. Each attempt scatters fresh obstacles
 * and walks around them; attempts repeat until one reaches the coverage target
 * (keeping the best seen). Throws only if even the best of MAX_ATTEMPTS falls
 * short of the target — a deterministic outcome per seed.
 */
export function generate(config: GeneratorConfig): GeneratedLevel {
  validate(config);
  const topology: Topology =
    config.shape === 'hex'
      ? new HexGrid(config.width, config.height)
      : new SquareGrid(config.width, config.height);
  const total = topology.cells.length;
  const target = Math.ceil(config.coverage * total);
  const scatterCount = Math.round(SCATTER_DENSITY * total);
  const rng = createRng(config.seed);

  // Step 1+2, retried: scatter obstacles, then walk around them, stopping at the
  // target. The best (longest) walk wins; stopping *at* target is what leaves the
  // remaining cells to become obstacles rather than covering the whole board.
  let bestWalk: CellId[] = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const scattered = sampleCells(topology.cells, scatterCount, rng);
    const walk = selfAvoidingWalk(topology, rng, scattered, target);
    if (walk.length > bestWalk.length) bestWalk = walk;
    if (bestWalk.length >= target) break;
  }

  const coverage = bestWalk.length / total;
  if (bestWalk.length < target) {
    throw new Error(
      `Generator could not meet coverage floor ${config.coverage} for seed ` +
        `${config.seed} on ${config.width}x${config.height} (best ${coverage.toFixed(2)})`,
    );
  }

  // Step 3: every walked cell is grass; every other cell — scattered obstacle or
  // unwalked leftover alike — is an obstacle.
  const walked = new Set(bestWalk);
  const traits = new Map<CellId, CellTraits>();
  const obstacleCells: CellId[] = [];
  for (const cell of topology.cells) {
    const isGrass = walked.has(cell);
    traits.set(cell, isGrass ? GRASS : OBSTACLE);
    if (!isGrass) obstacleCells.push(cell);
  }

  // Step 4: give each obstacle a visual kind, clustering water into connected bodies
  // (purely cosmetic; traits above are already final and untouched here).
  const decor = assignDecor(topology, obstacleCells, rng);

  // Time limit scales with the solution: the perfect mow takes bestWalk.length - 1
  // moves (the start is mowed for free), budgeted at MS_PER_STEP each — double on hex.
  const steps = bestWalk.length - 1;
  const level: Level = {
    topology,
    traits,
    start: bestWalk[0],
    config: { timerStart: 'firstMove', timeLimitMs: steps * MS_PER_STEP[config.shape ?? 'square'] },
    decor,
  };
  return { level, walk: bestWalk, coverage };
}

/** Convenience: the generated Level alone (drops the proving walk/coverage). */
export function generateLevel(config: GeneratorConfig): Level {
  return generate(config).level;
}
