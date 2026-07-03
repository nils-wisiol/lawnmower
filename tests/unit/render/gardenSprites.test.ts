import { describe, expect, it } from 'vitest';

import { gardenSprites, WATER_EDGE } from '../../../src/render/gardenSprites.ts';
import type { Sprite } from '../../../src/render/sprite.ts';

// Trees and flowers were hard to tell apart from mowable grass — green on green.
// Each now sits on a patch of brown soil (a round disc for trees, a rectangular bed
// for flowers), so the tile reads clearly against the lawn and the two kinds are
// distinguishable at a glance. These lock in: soil is present, the shapes differ,
// and a green margin is left around the patch.

const TILE = 16;

/** RGB channels of a #rrggbb(aa) colour. */
function rgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1, 7), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/** A dark brown (soil): red dominant over green over blue, and not a bright hue. */
function isSoil(hex: string): boolean {
  const { r, g, b } = rgb(hex);
  return r > g && g > b && r < 170;
}

/** A green (grass/foliage): green is the dominant channel. */
function isGreen(hex: string): boolean {
  const { r, g, b } = rgb(hex);
  return g > r && g > b;
}

/** Blue water: blue is the dominant channel. */
function isWater(hex: string): boolean {
  const { r, g, b } = rgb(hex);
  return b > r && b > g;
}

/** Pixel keys (y*16+x) painted with a soil colour. */
function soilPixels(s: Sprite): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < s.pixels.length; i++) {
    if (isSoil(s.palette[s.pixels[i]])) out.add(i);
  }
  return out;
}

function colorAt(s: Sprite, x: number, y: number): string {
  return s.palette[s.pixels[y * TILE + x]];
}

const CORNERS: readonly [number, number][] = [
  [0, 0],
  [TILE - 1, 0],
  [0, TILE - 1],
  [TILE - 1, TILE - 1],
];

describe('tree/flower soil (distinguishable from mowable grass)', () => {
  const tree = gardenSprites.trees[0];
  const flower = gardenSprites.flowers[0];

  it('draws a substantial patch of brown soil under each plant', () => {
    // A real patch, not a stray brown pixel or two.
    expect(soilPixels(tree).size).toBeGreaterThan(30);
    expect(soilPixels(flower).size).toBeGreaterThan(30);
  });

  it('leaves a green margin — the four tile corners stay grass, never soil', () => {
    for (const s of [tree, flower]) {
      for (const [x, y] of CORNERS) {
        expect(isSoil(colorAt(s, x, y))).toBe(false);
        expect(isGreen(colorAt(s, x, y))).toBe(true);
      }
    }
  });

  it('gives trees and flowers distinctly different soil shapes', () => {
    const treeSoil = soilPixels(tree);
    const flowerSoil = soilPixels(flower);
    const key = (x: number, y: number): number => y * TILE + x;

    // Different footprints: not the same set of soil pixels.
    const identical =
      treeSoil.size === flowerSoil.size && [...treeSoil].every((p) => flowerSoil.has(p));
    expect(identical).toBe(false);

    // Round disc vs rectangular bed. The disc bulges out near the top (soil at row 4),
    // where the flower — whose bloom sits above its lower bed — has none…
    expect(treeSoil.has(key(3, 4))).toBe(true);
    expect(flowerSoil.has(key(3, 4))).toBe(false);
    // …and the bed runs full-width across its bottom rows, where the disc has tapered
    // back in, so soil reaches the near-edge columns for the flower but not the tree.
    expect(flowerSoil.has(key(2, 12))).toBe(true);
    expect(treeSoil.has(key(2, 12))).toBe(false);
  });
});

// A body of water shouldn't be a hard blue square: each tile banks onto the lawn on
// any side that isn't itself water, so edges and corners get a green shoreline margin.
// The 16 tiles are indexed by a WATER_EDGE mask of which neighbours are water.
describe('water edge/corner tiles (shoreline margins)', () => {
  const water = gardenSprites.water;
  const mid = TILE / 2;
  const edgeMid = {
    N: [mid, 0] as const,
    S: [mid, TILE - 1] as const,
    W: [0, mid] as const,
    E: [TILE - 1, mid] as const,
  };
  const at = (s: Sprite, [x, y]: readonly [number, number]): string => colorAt(s, x, y);

  it('provides all 16 neighbour combinations', () => {
    expect(water).toHaveLength(16);
  });

  it('the fully-surrounded tile (mask 15) is all water — no margin on any side', () => {
    const full = water[15];
    for (const side of Object.values(edgeMid)) {
      expect(isWater(at(full, side))).toBe(true);
    }
    expect(isWater(colorAt(full, mid, mid))).toBe(true); // and water in the middle
  });

  it('an isolated tile (mask 0) has a grass margin on every side, water in the centre', () => {
    const lone = water[0];
    for (const side of Object.values(edgeMid)) {
      expect(isGreen(at(lone, side))).toBe(true);
    }
    expect(isWater(colorAt(lone, mid, mid))).toBe(true);
  });

  it('banks a margin only onto land sides — the top-of-body tile is water at its base', () => {
    // Only the S neighbour is water: this is the north bank of a body. Water meets the
    // southern edge; the other three sides keep a grass margin.
    const northBank = water[WATER_EDGE.S];
    expect(isWater(at(northBank, edgeMid.S))).toBe(true);
    expect(isGreen(at(northBank, edgeMid.N))).toBe(true);
    expect(isGreen(at(northBank, edgeMid.E))).toBe(true);
    expect(isGreen(at(northBank, edgeMid.W))).toBe(true);
  });

  it('a corner tile keeps water on its two water sides and grass on the other two', () => {
    // Water to the E and S → the NW corner of a body: water fills toward the SE.
    const nwCorner = water[WATER_EDGE.E | WATER_EDGE.S];
    expect(isWater(at(nwCorner, edgeMid.S))).toBe(true);
    expect(isWater(at(nwCorner, edgeMid.E))).toBe(true);
    expect(isGreen(at(nwCorner, edgeMid.N))).toBe(true);
    expect(isGreen(at(nwCorner, edgeMid.W))).toBe(true);
  });
});
