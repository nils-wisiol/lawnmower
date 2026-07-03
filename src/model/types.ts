// Core model types (M1). Geometry-agnostic by design: the game logic operates on
// an abstract cell graph, so square-grid, hex, 8-way, and teleport all become
// alternative Topology/Level data — not rewrites (see lawnmower.md §5).

/**
 * Opaque identifier for a cell. Never parse or order these in core logic; only
 * the concrete Topology that minted them knows their internal structure. Keeping
 * them opaque is what lets a hex grid or teleport edge drop in unchanged.
 */
export type CellId = string;

/**
 * A movement direction understood by a specific Topology (e.g. 'N'|'S'|'E'|'W'
 * for a square grid, or six axial directions on a hex grid). Opaque to core logic.
 */
export type Direction = string;

/**
 * Abstract input intent produced by the input pipeline (arrow keys, swipes),
 * before a Topology maps it onto one of its Directions. This indirection is why
 * hex + swipe mapping (lawnmower.md §10) can be solved without touching core rules.
 *
 * The set is the *superset* of every geometry's movement intents (hexagonal.md §2.2):
 * a square grid uses the four cardinals; a flat-top hex uses the vertical pair plus
 * the four diagonals (and no left/right). Each Topology maps the intents it cares
 * about via `directionForInput` and returns undefined for the rest, so the keyboard
 * and swipe layers stay geometry-blind — a key/gesture means a fixed intent, and the
 * topology decides what (if anything) that intent does.
 */
export type InputDirection =
  'up' | 'down' | 'left' | 'right' | 'upLeft' | 'upRight' | 'downLeft' | 'downRight';

/**
 * The mower's rendered heading — the four cardinal facings its sprite can show. A
 * render-only concept, distinct from the (wider) InputDirection intent set: a move
 * in any intent, from any modality (key, swipe, tap-to-move), is reduced to the
 * nearest cardinal facing from its screen-space delta (hexagonal.md §2.6). True
 * six-heading hex facing is an H3 concern; until then diagonals round to a cardinal.
 */
export type Facing = 'up' | 'down' | 'left' | 'right';

/**
 * The two orthogonal traits of a cell (lawnmower.md §2). Deliberately NOT a single
 * `grass | obstacle` enum: movement reads `passable`, the win condition counts
 * `mowable`, and the revisit fail fires only on `mowable`. New tile kinds
 * (passable-but-not-mowable, etc.) are therefore data, not logic changes.
 */
export interface CellTraits {
  /** Can the mower enter this cell? */
  readonly passable: boolean;
  /** Does this cell count toward the objective, and does re-entering it fail? */
  readonly mowable: boolean;
}

/** Pixel-space position of a cell, in cell units (renderer scales). For M2 rendering. */
export interface CellPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * A purely-visual sub-kind for an obstacle cell (lawnmower.md §3). Deliberately NOT
 * a CellTraits field: gameplay treats every obstacle identically (all impassable +
 * non-mowable), so this never touches movement, the win condition, or the revisit
 * fail. It exists only so distinct-looking obstacles can be drawn from level *data*
 * rather than a render-time hash — which is what lets the generator cluster water
 * into connected bodies and lets the renderer pick the right water-edge tile.
 */
export type Decor =
  | 'water' // part of a lake/pond body
  | 'tree' // a tree on a grassy patch
  | 'flower' // a flower on a grassy patch
  | 'water-fountain' // a fountain standing in a water body (counts as water for edges)
  | 'lawn-fountain'; // a fountain on a grassy patch

/**
 * The central abstraction (lawnmower.md §5): cells, adjacency, a direction set,
 * cell→pixel layout, and input mapping. Square grid and hex grid are two
 * implementations of this one interface.
 *
 * Adjacency is NOT assumed to be geometric: `neighbor` may return any cell,
 * including a non-adjacent one, which is exactly how teleport edges are expressed.
 */
export interface Topology {
  /** Every cell in this board. */
  readonly cells: readonly CellId[];
  /** The directions the mower may attempt to move in. */
  readonly directions: readonly Direction[];
  /**
   * The neighbor reached by moving from `cell` in `direction`, or undefined if
   * there is none (board edge). May return a non-geometrically-adjacent cell.
   */
  neighbor(cell: CellId, direction: Direction): CellId | undefined;
  /** Map an abstract input intent onto a direction, or undefined if unmapped. */
  directionForInput(input: InputDirection): Direction | undefined;
  /** Pixel-space layout of a cell, for rendering. */
  layout(cell: CellId): CellPoint;
  /**
   * The inverse of `layout`: the cell containing point `p` (in the same cell-unit
   * space `layout` returns), or undefined if `p` lies outside the board. Each
   * geometry implements its own point→cell test — square rounds to the grid, hex
   * does axial rounding — so click/tap-to-move (hexagonal.md §2.6) needs no geometry
   * knowledge in the app.
   */
  cellAt(p: CellPoint): CellId | undefined;
}

/**
 * When a level's wall-clock timer begins (lawnmower.md §2). Default is `firstMove`
 * so planning before the first move is free; a level may override to `load` to
 * start the clock the instant it appears.
 */
export type TimerStart = 'firstMove' | 'load';

/**
 * Per-level scoring/timing config (lawnmower.md §2). Optional on a Level; absent
 * fields fall back to DEFAULT_LEVEL_CONFIG. Kept as data on the level so the
 * generator and hand-authored maps can each set it without touching game logic.
 */
export interface LevelConfig {
  /** When the timer starts. Defaults to `firstMove`. */
  readonly timerStart: TimerStart;
  /**
   * Optional time limit in milliseconds; exceeding it is a hard fail (§2). Absent
   * = untimed (score is completion time only). Time-limit *sourcing* is an open
   * question (§10), so the generator leaves this unset for now.
   */
  readonly timeLimitMs?: number;
}

/** Config used when a Level omits its own: free planning time, no time limit. */
export const DEFAULT_LEVEL_CONFIG: LevelConfig = { timerStart: 'firstMove' };

/**
 * A fully-specified level (lawnmower.md §5 "long form"): the board topology, the
 * traits of every cell, and a fixed start. Short-form seeds expand into this.
 */
export interface Level {
  readonly topology: Topology;
  /** Traits for every cell in `topology.cells`. */
  readonly traits: ReadonlyMap<CellId, CellTraits>;
  /** Fixed starting cell of the mower. Must be passable. */
  readonly start: CellId;
  /** Optional scoring/timing config; see levelConfig() for the resolved value. */
  readonly config?: LevelConfig;
  /**
   * Optional purely-visual decoration for obstacle cells (which look like water vs
   * a tree vs a flower). Absent for hand-authored/ascii levels — the renderer then
   * falls back to a deterministic per-cell pick. Never consulted by game logic.
   */
  readonly decor?: ReadonlyMap<CellId, Decor>;
}

/** Resolve a level's timing config, filling in defaults for an absent one. */
export function levelConfig(level: Level): LevelConfig {
  return level.config ?? DEFAULT_LEVEL_CONFIG;
}

/** Look up a cell's traits, throwing if the level is missing an entry for it. */
export function traitsOf(level: Level, cell: CellId): CellTraits {
  const t = level.traits.get(cell);
  if (t === undefined) {
    throw new Error(`Level has no traits for cell "${cell}"`);
  }
  return t;
}

/** Look up a cell's visual decoration, or undefined if the level assigns none. */
export function decorOf(level: Level, cell: CellId): Decor | undefined {
  return level.decor?.get(cell);
}

/** Count the cells that count toward the objective (the mowable ones). */
export function countMowable(level: Level): number {
  let n = 0;
  for (const cell of level.topology.cells) {
    if (traitsOf(level, cell).mowable) n++;
  }
  return n;
}
