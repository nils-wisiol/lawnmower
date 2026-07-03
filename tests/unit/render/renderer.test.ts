import { describe, expect, it } from 'vitest';

import {
  cellFill,
  fitCellSize,
  legalNeighbors,
  spriteForCell,
} from '../../../src/render/canvasRenderer.ts';
import { gardenTheme } from '../../../src/render/theme.ts';
import { WATER_EDGE } from '../../../src/render/gardenSprites.ts';
import {
  createGame,
  levelFromAscii,
  move,
  type CellId,
  type Decor,
  type Level,
} from '../../../src/model/index.ts';

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
  // '#' obstacle, 'P' path, '.'/'S' grass — one cell of each trait to probe.
  const level = levelFromAscii('#P\n.S');

  it('a decor-less obstacle falls back to a hashed obstacle-pool sprite', () => {
    const s = spriteForCell(t, level, '0,0', false);
    expect(t.sprites.obstacles).toContain(s);
  });

  it('passable-but-not-mowable draws the path sprite', () => {
    expect(spriteForCell(t, level, '1,0', false)).toBe(t.sprites.path);
  });

  it('mowed vs unmowed grass draw different sprites (the visible trail)', () => {
    const unmowed = spriteForCell(t, level, '0,1', false);
    const mowed = spriteForCell(t, level, '0,1', true);
    expect(mowed).toBe(t.sprites.grassMowed);
    expect(t.sprites.grassUnmowed).toContain(unmowed);
    expect(mowed).not.toBe(unmowed);
  });

  it('picks the same variant for a cell every time (no shimmer)', () => {
    const a = spriteForCell(t, level, '0,0', false);
    const b = spriteForCell(t, level, '0,0', false);
    expect(a).toBe(b);
  });
});

// Obstacle decor (lawnmower.md §3) drives which art an obstacle draws, from level
// data rather than a blind hash — so water, trees and flowers are placeable.
describe('spriteForCell (decor-driven obstacles)', () => {
  const t = gardenTheme;
  // A top row of obstacles (each tagged with a distinct decor kind) over a grass row
  // carrying the required start.
  const base = levelFromAscii('###\n..S');
  const decor = new Map<CellId, Decor>([
    ['0,0', 'water'],
    ['1,0', 'tree'],
    ['2,0', 'flower'],
  ]);
  const level: Level = { ...base, decor };

  it('draws water / tree / flower art from the cell decor', () => {
    expect(t.sprites.water).toContain(spriteForCell(t, level, '0,0', false));
    expect(t.sprites.trees).toContain(spriteForCell(t, level, '1,0', false));
    expect(t.sprites.flowers).toContain(spriteForCell(t, level, '2,0', false));
  });
});

// Fountains: a fountain in a pond (water-fountain) and one on the lawn (lawn-fountain)
// draw their own art, and a water fountain still counts as water for the shoreline so a
// body doesn't get a hole banked around it.
describe('spriteForCell (fountains)', () => {
  const t = gardenTheme;

  it('draws the water-fountain and lawn-fountain art from their decor', () => {
    const base = levelFromAscii('##\n.S');
    const level: Level = {
      ...base,
      decor: new Map<CellId, Decor>([
        ['0,0', 'water-fountain'],
        ['1,0', 'lawn-fountain'],
      ]),
    };
    expect(spriteForCell(t, level, '0,0', false)).toBe(t.sprites.waterFountain);
    expect(spriteForCell(t, level, '1,0', false)).toBe(t.sprites.lawnFountain);
  });

  it('a water fountain counts as water for a neighbouring cell’s shoreline', () => {
    // Centre water cell '1,1' with a water fountain to its N and plain water to its S:
    // both count as water, so the tile banks on N and S (mask N|S), grass E/W.
    //   .F.
    //   .#.
    //   .#.
    //   S..
    const base = levelFromAscii('.#.\n.#.\n.#.\nS..');
    const level: Level = {
      ...base,
      decor: new Map<CellId, Decor>([
        ['1,0', 'water-fountain'],
        ['1,1', 'water'],
        ['1,2', 'water'],
      ]),
    };
    expect(spriteForCell(t, level, '1,1', false)).toBe(
      t.sprites.water[WATER_EDGE.N | WATER_EDGE.S],
    );
  });
});

// A water cell picks the tile that banks onto the lawn on its land sides: the renderer
// masks in which orthogonal neighbours are also water (WATER_EDGE) and indexes the
// water tile set with it, so shorelines and corners line up with the body's shape.
describe('spriteForCell (water edge tiles follow the body shape)', () => {
  const t = gardenTheme;
  // A vertical 1x3 water body in the middle column; grass either side + the start.
  //   .#.
  //   .#.
  //   .#.
  //   S..
  const base = levelFromAscii('.#.\n.#.\n.#.\nS..');
  const decor = new Map<CellId, Decor>([
    ['1,0', 'water'],
    ['1,1', 'water'],
    ['1,2', 'water'],
  ]);
  const level: Level = { ...base, decor };

  it('the middle of the body has water above and below (N|S), grass left/right', () => {
    expect(spriteForCell(t, level, '1,1', false)).toBe(
      t.sprites.water[WATER_EDGE.N | WATER_EDGE.S],
    );
  });

  it('the top of the body banks only to the south (its only water neighbour)', () => {
    expect(spriteForCell(t, level, '1,0', false)).toBe(t.sprites.water[WATER_EDGE.S]);
  });

  it('the bottom of the body banks only to the north', () => {
    expect(spriteForCell(t, level, '1,2', false)).toBe(t.sprites.water[WATER_EDGE.N]);
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
