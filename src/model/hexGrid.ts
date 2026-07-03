// Flat-top hexagonal Topology (hexagonal.md §2). A sibling of SquareGrid: the same
// Topology interface, six-way adjacency (N/S/NE/NW/SE/SW — no pure E/W), cells packed
// into a rectangular column/row region. Coordinates are axial (q, r) internally (clean
// neighbour math) and encoded into the opaque CellId as "q,r" — the same opaque-string
// discipline as squareGrid.ts. The core rules, generator, and renderer consume this
// through the Topology interface unchanged, so this file has no privileged status.

import type { CellId, CellPoint, Direction, InputDirection, Topology } from './types.ts';

/** The six neighbour directions of a flat-top hex (no pure E/W; §2.1). */
export const HEX_DIRECTIONS = ['N', 'S', 'NE', 'SE', 'NW', 'SW'] as const;
export type HexDirection = (typeof HEX_DIRECTIONS)[number];

/**
 * Axial (q, r) step for each flat-top direction. Read off the flat-top pixel layout
 * below: (0,-1) points straight up, (0,+1) straight down, and the four diagonals
 * shift a column left/right (±1 in q) with a half-row of vertical travel.
 */
const DELTA: Record<HexDirection, { dq: number; dr: number }> = {
  N: { dq: 0, dr: -1 },
  S: { dq: 0, dr: 1 },
  NE: { dq: 1, dr: -1 },
  SE: { dq: 1, dr: 0 },
  NW: { dq: -1, dr: 0 },
  SW: { dq: -1, dr: 1 },
};

/**
 * Abstract input intent → hex direction. Keyed by the full 8-name intent superset the
 * input pipeline will produce (§2.2): today `InputDirection` is only the four square
 * intents, so `left`/`right` (a flat-top hex has no E/W) and the four diagonals simply
 * never arrive until H2 widens the type. Mapping them here now makes that widening a
 * no-op for this file, so H2 wires keys/swipe without revisiting the geometry.
 */
const INPUT_TO_DIRECTION: Partial<Record<string, HexDirection>> = {
  up: 'N',
  down: 'S',
  upLeft: 'NW',
  upRight: 'NE',
  downLeft: 'SW',
  downRight: 'SE',
};

/** √3 shows up throughout flat-top layout math (vertical hex spacing). */
const SQRT3 = Math.sqrt(3);

/** Encode axial coordinates into an opaque cell id. */
export function hexCellId(q: number, r: number): CellId {
  return `${q},${r}`;
}

/** Decode a hex cell id back into axial coordinates. Hex-grid-internal only. */
export function axial(cell: CellId): { q: number; r: number } {
  const comma = cell.indexOf(',');
  return { q: Number(cell.slice(0, comma)), r: Number(cell.slice(comma + 1)) };
}

// Odd-q offset ↔ axial conversions (Red Blob Games). Offset (col, row) enumerates a
// clean width×height rectangle — so the generator's width/height mean the same thing
// they do for a square board — while axial drives the neighbour and layout math.
function axialToOffset(q: number, r: number): { col: number; row: number } {
  return { col: q, row: r + (q - (q & 1)) / 2 };
}
function offsetToAxial(col: number, row: number): { q: number; r: number } {
  return { q: col, r: row - (col - (col & 1)) / 2 };
}

/**
 * Round fractional axial coordinates to the nearest hex (cube rounding): round each of
 * the three cube coordinates, then fix up whichever drifted most so q + r + s == 0.
 */
function hexRound(fq: number, fr: number): { q: number; r: number } {
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

/**
 * A `width`×`height` flat-top hex grid with 6-way adjacency, cells packed into an
 * odd-q offset rectangle. Like SquareGrid, every position exists as a cell; obstacles
 * live in per-cell traits at the Level layer, so neighbour math stays pure geometry.
 */
export class HexGrid implements Topology {
  readonly cells: readonly CellId[];
  readonly directions = HEX_DIRECTIONS;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    if (width <= 0 || height <= 0) {
      throw new Error(`HexGrid dimensions must be positive, got ${width}x${height}`);
    }
    const cells: CellId[] = [];
    for (let col = 0; col < width; col++) {
      for (let row = 0; row < height; row++) {
        const { q, r } = offsetToAxial(col, row);
        cells.push(hexCellId(q, r));
      }
    }
    this.cells = cells;
  }

  private inBounds(q: number, r: number): boolean {
    const { col, row } = axialToOffset(q, r);
    return col >= 0 && col < this.width && row >= 0 && row < this.height;
  }

  neighbor(cell: CellId, direction: Direction): CellId | undefined {
    const delta = DELTA[direction as HexDirection];
    if (delta === undefined) return undefined;
    const { q, r } = axial(cell);
    const nq = q + delta.dq;
    const nr = r + delta.dr;
    return this.inBounds(nq, nr) ? hexCellId(nq, nr) : undefined;
  }

  directionForInput(input: InputDirection): Direction | undefined {
    return INPUT_TO_DIRECTION[input];
  }

  layout(cell: CellId): CellPoint {
    // Flat-top layout in cell units (hex "size" 1): columns step 1.5 in x and overlap
    // vertically, so odd columns sit half a hex lower (the r + q/2 term).
    const { q, r } = axial(cell);
    return { x: 1.5 * q, y: SQRT3 * (r + q / 2) };
  }

  cellAt(p: CellPoint): CellId | undefined {
    // Inverse of `layout`: recover fractional axial coordinates, cube-round to the
    // nearest hex, then reject points that land off the board.
    const fq = (2 / 3) * p.x;
    const fr = p.y / SQRT3 - p.x / 3;
    const { q, r } = hexRound(fq, fr);
    return this.inBounds(q, r) ? hexCellId(q, r) : undefined;
  }

  cellPolygon(): readonly CellPoint[] {
    // A flat-top hexagon of circumradius 1 centred on the layout point: two corners on
    // the horizontal axis (±1, 0) and four at ±½ column / ±√3⁄2 row. These match the
    // 1.5-column / √3-row layout spacing exactly, so neighbouring hexes share edges.
    const h = SQRT3 / 2;
    return [
      { x: 1, y: 0 },
      { x: 0.5, y: h },
      { x: -0.5, y: h },
      { x: -1, y: 0 },
      { x: -0.5, y: -h },
      { x: 0.5, y: -h },
    ];
  }
}
