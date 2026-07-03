import { describe, expect, it } from 'vitest';

import { cellFill, fitCellSize } from '../../../src/render/canvasRenderer.ts';
import { gardenTheme } from '../../../src/render/theme.ts';

// The renderer colours a cell from its *traits* + mow state (mirroring the
// trait-based model), never a tile-name enum. This locks that mapping so a new
// trait combination themes itself and no cell falls through to a wrong colour.
describe('cellFill (trait-driven colouring)', () => {
  const t = gardenTheme;

  it('obstacles (impassable) use the obstacle colour regardless of mowable/mowed', () => {
    expect(cellFill(t, { passable: false, mowable: false }, false)).toBe(t.obstacle);
  });

  it('passable-but-not-mowable uses the path colour, mowed state ignored', () => {
    expect(cellFill(t, { passable: true, mowable: false }, false)).toBe(t.path);
    expect(cellFill(t, { passable: true, mowable: false }, true)).toBe(t.path);
  });

  it('unmowed grass vs mowed grass are distinct colours (the visible trail)', () => {
    const unmowed = cellFill(t, { passable: true, mowable: true }, false);
    const mowed = cellFill(t, { passable: true, mowable: true }, true);
    expect(unmowed).toBe(t.grassUnmowed);
    expect(mowed).toBe(t.grassMowed);
    expect(unmowed).not.toBe(mowed);
  });

  // Intuition: a freshly mown stripe is the *brighter* green, uncut grass the
  // darker/overgrown one. Locked so the two aren't accidentally swapped back.
  it('mowed grass reads brighter than unmowed grass', () => {
    expect(luminance(t.grassMowed)).toBeGreaterThan(luminance(t.grassUnmowed));
  });
});

/** Perceptual (Rec. 709) luminance of a #rrggbb colour, for brightness comparisons. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// The board must fit the screen width on narrow phones: cells shrink so the whole
// grid stays within the available width, and never upscale past the desired size.
describe('fitCellSize (board fits the viewport width)', () => {
  it('uses the desired size when no maxWidth is given', () => {
    expect(fitCellSize(12, { cellSize: 48 })).toBe(48);
    expect(fitCellSize(20)).toBe(48); // DEFAULT_CELL_SIZE
  });

  it('shrinks cells so a wide board fits a narrow screen', () => {
    const cols = 12;
    const maxWidth = 360;
    const size = fitCellSize(cols, { cellSize: 48, maxWidth });
    expect(size).toBeLessThan(48);
    expect(cols * size).toBeLessThanOrEqual(maxWidth);
    expect(size).toBeGreaterThan(0);
  });

  it('never upscales past the desired size when there is room to spare', () => {
    expect(fitCellSize(4, { cellSize: 48, maxWidth: 4000 })).toBe(48);
  });

  it('is a no-op for a degenerate (zero-column) board', () => {
    expect(fitCellSize(0, { cellSize: 48, maxWidth: 100 })).toBe(48);
  });
});
