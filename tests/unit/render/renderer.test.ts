import { describe, expect, it } from 'vitest';

import {
  cellFill,
  fitCellSize,
  legalNeighbors,
  spriteForCell,
} from '../../../src/render/canvasRenderer.ts';
import { gardenTheme } from '../../../src/render/theme.ts';
import { createGame, levelFromAscii, move } from '../../../src/model/index.ts';

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

// The sprite chosen for a cell mirrors cellFill: driven by traits + mow state, and
// stable per-cell (so a lawn doesn't shimmer between redraws). This locks the
// trait→sprite mapping and the determinism of the per-cell variety.
describe('spriteForCell (trait-driven pixel art)', () => {
  const t = gardenTheme;
  const cell = '2,3';

  it('obstacles draw an obstacle-variant sprite', () => {
    const s = spriteForCell(t, { passable: false, mowable: false }, false, cell);
    expect(t.sprites.obstacles).toContain(s);
  });

  it('passable-but-not-mowable draws the path sprite', () => {
    expect(spriteForCell(t, { passable: true, mowable: false }, false, cell)).toBe(t.sprites.path);
  });

  it('mowed vs unmowed grass draw different sprites (the visible trail)', () => {
    const unmowed = spriteForCell(t, { passable: true, mowable: true }, false, cell);
    const mowed = spriteForCell(t, { passable: true, mowable: true }, true, cell);
    expect(mowed).toBe(t.sprites.grassMowed);
    expect(t.sprites.grassUnmowed).toContain(unmowed);
    expect(mowed).not.toBe(unmowed);
  });

  it('picks the same variant for a cell every time (no shimmer)', () => {
    const a = spriteForCell(t, { passable: false, mowable: false }, false, cell);
    const b = spriteForCell(t, { passable: false, mowable: false }, false, cell);
    expect(a).toBe(b);
  });
});

// The move-affordance hints (and the crash rule they encode): the mower may step to
// a passable neighbour, but never back onto an already-mown tile — that's the fail.
describe('legalNeighbors (move affordances)', () => {
  it('lists passable neighbours and excludes the just-mown cell behind the mower', () => {
    // A 1x3 strip: start at the left, one step right mows the middle.
    const level = levelFromAscii('S..');
    const start = createGame(level);
    const afterRight = move(start, 'right').state;

    // From the middle cell, left leads back onto the mown start (a crash) — excluded;
    // right leads to fresh grass — included.
    const legal = legalNeighbors(level, afterRight);
    expect(legal).toContain(level.topology.neighbor(afterRight.position, 'E'));
    expect(legal).not.toContain(level.start);
  });

  it('is empty once the game is no longer playing', () => {
    const level = levelFromAscii('S.');
    const won = move(createGame(level), 'right').state; // mows the last tile → won
    expect(won.status).toBe('won');
    expect(legalNeighbors(level, won)).toEqual([]);
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
