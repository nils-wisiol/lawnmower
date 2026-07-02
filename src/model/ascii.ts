// Compact ASCII authoring of long-form square-grid levels. Handy for tests and
// hand-made maps; the seeded generator (M3) produces the same Level shape.
//
// Legend (one char per cell, rows separated by newlines):
//   '.'  grass   — passable + mowable
//   'S'  start   — grass that is the mower's start (exactly one required)
//   '#'  obstacle — impassable (not mowable)
//   'P'  path    — passable + NOT mowable (crossable freely; forward-compat tile)

import { SquareGrid, cellId } from './squareGrid.ts';
import type { CellId, CellTraits, Level } from './types.ts';

const LEGEND: Record<string, CellTraits> = {
  '.': { passable: true, mowable: true },
  S: { passable: true, mowable: true },
  '#': { passable: false, mowable: false },
  P: { passable: true, mowable: false },
};

/**
 * Parse an ASCII map into a Level. Lines are rows; every non-empty line must have
 * equal width. Exactly one 'S' marks the start.
 */
export function levelFromAscii(map: string): Level {
  const rows = map.split('\n').filter((line) => line.length > 0);
  if (rows.length === 0) {
    throw new Error('Empty level map');
  }
  const width = rows[0].length;
  const height = rows.length;

  const topology = new SquareGrid(width, height);
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
      const id = cellId(x, y);
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
