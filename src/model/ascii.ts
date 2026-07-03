// Compact ASCII authoring of long-form levels. Handy for tests and hand-made maps;
// the seeded generator (M3) produces the same Level shape.
//
// Legend (one char per cell, rows separated by newlines):
//   '.'  grass   — passable + mowable
//   'S'  start   — grass that is the mower's start (exactly one required)
//   '#'  obstacle — impassable (not mowable)
//   'P'  path    — passable + NOT mowable (crossable freely; forward-compat tile)
//
// `levelFromAscii` builds a square grid; `hexLevelFromAscii` builds a flat-top hex
// grid from the *same* rectangular char grid, reading each (col, row) as an odd-q
// offset cell (hexagonal.md H4) — so a small hex board is as readable to author as a
// square one, the flat-top half-row offset being a rendering concern, not a text one.

import { SquareGrid, cellId } from './squareGrid.ts';
import { HexGrid, offsetCellId } from './hexGrid.ts';
import type { CellId, CellTraits, Level, Topology } from './types.ts';

const LEGEND: Record<string, CellTraits> = {
  '.': { passable: true, mowable: true },
  S: { passable: true, mowable: true },
  '#': { passable: false, mowable: false },
  P: { passable: true, mowable: false },
};

/**
 * Parse an ASCII map into a Level over the topology `makeTopology` builds and the cell
 * ids `makeCellId` mints for each (col, row). Lines are rows; every non-empty line must
 * have equal width. Exactly one 'S' marks the start. Shared by the square and hex
 * authoring helpers, which differ only in the topology and cell-id mapping.
 */
function parseAscii(
  map: string,
  makeTopology: (width: number, height: number) => Topology,
  makeCellId: (col: number, row: number) => CellId,
): Level {
  const rows = map.split('\n').filter((line) => line.length > 0);
  if (rows.length === 0) {
    throw new Error('Empty level map');
  }
  const width = rows[0].length;
  const height = rows.length;

  const topology = makeTopology(width, height);
  const traits = new Map<CellId, CellTraits>();
  let start: CellId | undefined;

  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`Row ${y} has width ${row.length}, expected ${width}`);
    }
    for (let x = 0; x < width; x++) {
      const ch = row[x];
      const cellTraits = LEGEND[ch];
      if (cellTraits === undefined) {
        throw new Error(`Unknown map char "${ch}" at (${x},${y})`);
      }
      const id = makeCellId(x, y);
      traits.set(id, cellTraits);
      if (ch === 'S') {
        if (start !== undefined) {
          throw new Error('Level has more than one start (S)');
        }
        start = id;
      }
    }
  });

  if (start === undefined) {
    throw new Error('Level has no start (S)');
  }

  return { topology, traits, start };
}

/** Parse an ASCII map into a square-grid Level (see the legend above). */
export function levelFromAscii(map: string): Level {
  return parseAscii(map, (w, h) => new SquareGrid(w, h), cellId);
}

/**
 * Parse an ASCII map into a flat-top hex Level. The rectangular char grid is read as an
 * odd-q offset board: text column = hex column, text row = offset row (so a vertical run
 * of chars in one column is an N–S line of hexes). Useful for readable hand-made hex
 * fixtures — shorelines, small ponds — in tests (hexagonal.md H4).
 */
export function hexLevelFromAscii(map: string): Level {
  return parseAscii(map, (w, h) => new HexGrid(w, h), offsetCellId);
}
