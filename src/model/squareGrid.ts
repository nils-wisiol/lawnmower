// Square-grid Topology: the one concrete geometry v1 ships (lawnmower.md §5/§9 M1).
// 4-way adjacency (N/S/E/W), rectangular bounds. A future hex grid is a sibling
// implementation of the same Topology interface — this file has no privileged status.

import type { CellId, CellPoint, Direction, InputDirection, Topology } from './types.ts';

/** The four cardinal directions of a square grid. */
export const SQUARE_DIRECTIONS = ['N', 'S', 'E', 'W'] as const;
export type SquareDirection = (typeof SQUARE_DIRECTIONS)[number];

const DELTA: Record<SquareDirection, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  S: { dx: 0, dy: 1 },
  E: { dx: 1, dy: 0 },
  W: { dx: -1, dy: 0 },
};

// Only the four cardinal intents map on a square grid; the hex-only diagonals
// (upLeft/…) never resolve to a direction here, so square play simply ignores them
// (hexagonal.md §2.2) and stays byte-for-byte unchanged when the intent set widens.
const INPUT_TO_DIRECTION: Partial<Record<InputDirection, SquareDirection>> = {
  up: 'N',
  down: 'S',
  left: 'W',
  right: 'E',
};

/** Encode grid coordinates into an opaque cell id. */
export function cellId(x: number, y: number): CellId {
  return `${x},${y}`;
}

/** Decode a square-grid cell id back into coordinates. Square-grid-internal only. */
export function coords(cell: CellId): { x: number; y: number } {
  const comma = cell.indexOf(',');
  const x = Number(cell.slice(0, comma));
  const y = Number(cell.slice(comma + 1));
  return { x, y };
}

/**
 * A `width`×`height` square grid with 4-way adjacency. All positions exist as
 * cells; obstacles are expressed via per-cell traits at the Level layer, not by
 * omitting cells (so neighbor math stays pure geometry).
 */
export class SquareGrid implements Topology {
  readonly cells: readonly CellId[];
  readonly directions = SQUARE_DIRECTIONS;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    if (width <= 0 || height <= 0) {
      throw new Error(`SquareGrid dimensions must be positive, got ${width}x${height}`);
    }
    const cells: CellId[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        cells.push(cellId(x, y));
      }
    }
    this.cells = cells;
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  neighbor(cell: CellId, direction: Direction): CellId | undefined {
    const delta = DELTA[direction as SquareDirection];
    if (delta === undefined) return undefined;
    const { x, y } = coords(cell);
    const nx = x + delta.dx;
    const ny = y + delta.dy;
    return this.inBounds(nx, ny) ? cellId(nx, ny) : undefined;
  }

  directionForInput(input: InputDirection): Direction | undefined {
    return INPUT_TO_DIRECTION[input];
  }

  layout(cell: CellId): CellPoint {
    return coords(cell);
  }

  cellAt(p: CellPoint): CellId | undefined {
    // Inverse of `layout` (which is the identity on coordinates): round to the
    // nearest grid cell, then reject points that land off the board.
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    return this.inBounds(x, y) ? cellId(x, y) : undefined;
  }

  cellPolygon(): readonly CellPoint[] {
    // A unit square centred on the layout point: corners ±½ a cell on each axis, so
    // adjacent integer-spaced cells tile edge-to-edge.
    return [
      { x: -0.5, y: -0.5 },
      { x: 0.5, y: -0.5 },
      { x: 0.5, y: 0.5 },
      { x: -0.5, y: 0.5 },
    ];
  }
}
