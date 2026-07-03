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
  SquareGrid,
  type CellId,
  type CellTraits,
  type Level,
  type Topology,
} from '../model/index.ts';
import { createRng, type Rng } from './rng.ts';

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
 * proportionally more time — at half a second per move the player must make. Time-
 * limit *sourcing* is an open question (§10); this per-step scaling is the first cut.
 */
const MS_PER_STEP = 500;

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
  const topology = new SquareGrid(config.width, config.height);
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
  for (const cell of topology.cells) {
    traits.set(cell, walked.has(cell) ? GRASS : OBSTACLE);
  }

  // Time limit scales with the solution: the perfect mow takes bestWalk.length - 1
  // moves (the start is mowed for free), budgeted at MS_PER_STEP each.
  const steps = bestWalk.length - 1;
  const level: Level = {
    topology,
    traits,
    start: bestWalk[0],
    config: { timerStart: 'firstMove', timeLimitMs: steps * MS_PER_STEP },
  };
  return { level, walk: bestWalk, coverage };
}

/** Convenience: the generated Level alone (drops the proving walk/coverage). */
export function generateLevel(config: GeneratorConfig): Level {
  return generate(config).level;
}
