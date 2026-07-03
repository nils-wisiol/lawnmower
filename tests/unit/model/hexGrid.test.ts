import { describe, expect, it } from 'vitest';

import { HexGrid, HEX_DIRECTIONS, hexCellId } from '../../../src/model/index.ts';

describe('HexGrid topology', () => {
  it('enumerates a width×height rectangle of cells', () => {
    const grid = new HexGrid(3, 2);
    expect(grid.cells).toHaveLength(6);
    // Odd-q offset: col 0 rows 0..1 → axial r == row; col 1 shifts by half a column.
    expect(grid.cells).toContain(hexCellId(0, 0));
    expect(grid.cells).toContain(hexCellId(1, 0));
    expect(new Set(grid.cells).size).toBe(grid.cells.length); // no duplicates
  });

  it('exposes six flat-top directions (N/S plus four diagonals, no E/W)', () => {
    const grid = new HexGrid(2, 2);
    expect([...grid.directions].sort()).toEqual([...HEX_DIRECTIONS].sort());
    expect(grid.directions).not.toContain('E');
    expect(grid.directions).not.toContain('W');
  });

  it('computes 6-way neighbours and respects bounds', () => {
    // 2×2: adjacency worked out from the odd-q offset packing.
    const grid = new HexGrid(2, 2);
    expect(grid.neighbor(hexCellId(0, 0), 'S')).toBe(hexCellId(0, 1));
    expect(grid.neighbor(hexCellId(0, 0), 'SE')).toBe(hexCellId(1, 0));
    // Off the board → undefined, never wrapping.
    expect(grid.neighbor(hexCellId(0, 0), 'N')).toBeUndefined();
    expect(grid.neighbor(hexCellId(0, 0), 'NW')).toBeUndefined();
    // Neighbour relation is symmetric.
    expect(grid.neighbor(hexCellId(1, 0), 'NW')).toBe(hexCellId(0, 0));
  });

  it('ignores directions it does not name (e.g. a square direction)', () => {
    const grid = new HexGrid(2, 2);
    expect(grid.neighbor(hexCellId(0, 0), 'E')).toBeUndefined();
  });

  it('maps the vertical input intents to N/S (diagonals await the H2 intent widening)', () => {
    const grid = new HexGrid(2, 2);
    expect(grid.directionForInput('up')).toBe('N');
    expect(grid.directionForInput('down')).toBe('S');
    // A flat-top hex has no pure E/W, so left/right are unmapped.
    expect(grid.directionForInput('left')).toBeUndefined();
    expect(grid.directionForInput('right')).toBeUndefined();
  });

  it('rejects non-positive dimensions', () => {
    expect(() => new HexGrid(0, 3)).toThrow();
    expect(() => new HexGrid(3, -1)).toThrow();
  });

  it('round-trips every cell through layout → cellAt', () => {
    const grid = new HexGrid(5, 4);
    for (const cell of grid.cells) {
      expect(grid.cellAt(grid.layout(cell))).toBe(cell);
    }
  });

  it('hit-tests points jittered around a cell centre back to that cell', () => {
    const grid = new HexGrid(5, 4);
    for (const cell of grid.cells) {
      const p = grid.layout(cell);
      // A small nudge in any direction stays inside the hex.
      for (const [dx, dy] of [
        [0.2, 0],
        [-0.2, 0],
        [0, 0.2],
        [0, -0.2],
      ]) {
        expect(grid.cellAt({ x: p.x + dx, y: p.y + dy })).toBe(cell);
      }
    }
  });

  it('returns undefined for a point outside the board', () => {
    const grid = new HexGrid(3, 3);
    expect(grid.cellAt({ x: -100, y: -100 })).toBeUndefined();
    expect(grid.cellAt({ x: 1000, y: 1000 })).toBeUndefined();
  });
});
