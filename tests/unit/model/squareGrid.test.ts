import { describe, expect, it } from 'vitest';

import { SquareGrid, cellId, coords } from '../../../src/model/index.ts';

describe('SquareGrid topology', () => {
  it('enumerates every cell', () => {
    const grid = new SquareGrid(3, 2);
    expect(grid.cells).toHaveLength(6);
    expect(grid.cells).toContain(cellId(0, 0));
    expect(grid.cells).toContain(cellId(2, 1));
  });

  it('computes 4-way neighbors and respects bounds', () => {
    const grid = new SquareGrid(3, 3);
    const center = cellId(1, 1);
    expect(grid.neighbor(center, 'N')).toBe(cellId(1, 0));
    expect(grid.neighbor(center, 'S')).toBe(cellId(1, 2));
    expect(grid.neighbor(center, 'E')).toBe(cellId(2, 1));
    expect(grid.neighbor(center, 'W')).toBe(cellId(0, 1));

    // Edges return undefined rather than wrapping.
    expect(grid.neighbor(cellId(0, 0), 'N')).toBeUndefined();
    expect(grid.neighbor(cellId(0, 0), 'W')).toBeUndefined();
    expect(grid.neighbor(cellId(2, 2), 'E')).toBeUndefined();
  });

  it('maps cardinal input intents to directions', () => {
    const grid = new SquareGrid(2, 2);
    expect(grid.directionForInput('up')).toBe('N');
    expect(grid.directionForInput('down')).toBe('S');
    expect(grid.directionForInput('left')).toBe('W');
    expect(grid.directionForInput('right')).toBe('E');
  });

  it('round-trips cell ids through coordinates', () => {
    const id = cellId(4, 7);
    expect(coords(id)).toEqual({ x: 4, y: 7 });
    expect(grid_layout_matches(id)).toBe(true);
  });

  it('rejects non-positive dimensions', () => {
    expect(() => new SquareGrid(0, 3)).toThrow();
    expect(() => new SquareGrid(3, -1)).toThrow();
  });
});

function grid_layout_matches(id: string): boolean {
  const grid = new SquareGrid(8, 8);
  const p = grid.layout(id);
  const c = coords(id);
  return p.x === c.x && p.y === c.y;
}
