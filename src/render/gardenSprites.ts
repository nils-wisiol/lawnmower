// The v1 garden theme's pixel art (lawnmower.md §3), authored as code/data and
// bundled inline. Textured ground tiles (grass, mown stripes, path, water) are
// built procedurally so their 16×16 dimensions are always exact; the hero objects
// (flower, tree, the directional mower) are hand-authored pixel matrices. Kept out
// of theme.ts so that file stays a thin manifest — swapping this module reskins the
// game with no renderer or logic change (§5 theming layer).

import { rotateCW, sprite, type Sprite } from './sprite.ts';
import type { InputDirection } from '../model/index.ts';

/** Every sprite is authored on a fixed 16×16 pixel grid, integer-scaled by the renderer. */
const TILE = 16;

/**
 * Cheap deterministic value hash in [0,1) for a pixel + variant seed — drives the
 * scattered blade/ripple speckle so textures look organic yet reproduce exactly.
 */
function noise(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 40503)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h >>> 8) / 0x01000000;
}

/** Build a 16×16 sprite from a per-pixel index function (0 = transparent). */
function buildTile(colors: readonly string[], at: (x: number, y: number) => number): Sprite {
  const palette = ['#00000000', ...colors];
  const pixels: number[] = [];
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) pixels.push(at(x, y));
  }
  return { w: TILE, h: TILE, palette, pixels };
}

/** Overgrown, uncut grass: a deep-green base speckled with darker and brighter blades. */
function grassTile(seed: number): Sprite {
  return buildTile(['#3c6b2a', '#335f23', '#4c8236'], (x, y) => {
    const n = noise(x, y, seed);
    if (n > 0.86) return 3; // bright blade tip
    if (n < 0.16) return 2; // dark blade
    return 1; // base
  });
}

/** Freshly-mown lawn: pale-green horizontal mowing stripes with a touch of grain. */
function mownTile(): Sprite {
  return buildTile(['#6cb04a', '#7cc255', '#5ea23e'], (x, y) => {
    const light = Math.floor(y / 4) % 2 === 0;
    if (noise(x, y, 9) > 0.9) return 3; // occasional cut-grass fleck
    return light ? 2 : 1;
  });
}

/** A garden path (passable-but-not-mowable, §2): sandy speckled ground. */
function pathTile(): Sprite {
  return buildTile(['#c8b071', '#bda766', '#d6bd82'], (x, y) => {
    const n = noise(x, y, 5);
    if (n > 0.85) return 3;
    if (n < 0.2) return 2;
    return 1;
  });
}

const WATER_COLORS: readonly string[] = ['#3f6f9e', '#35608f', '#6ea3d6']; // base, ripple, sparkle

/** Water colour index for a pixel: base, banded ripples, occasional sparkle. */
function waterPixel(x: number, y: number): number {
  const n = noise(x, y, 7);
  if (n > 0.9) return 3; // sparkle
  // Gentle horizontal ripple bands, offset per row for a watery feel.
  if ((y + Math.floor(noise(0, y, 2) * 3)) % 4 === 0) return 2;
  return 1;
}

/**
 * Which orthogonal neighbour is water, as bit flags (lawnmower.md §3). A water cell's
 * tile is chosen by OR-ing these for its water neighbours; the shared convention lets
 * the generator/renderer and the tile art agree on what each of the 16 variants means.
 */
export const WATER_EDGE = { N: 1, E: 2, S: 4, W: 8 } as const;

/** Green margin, in px, left on a water tile's land-facing (non-water) sides. */
const WATER_MARGIN = 2;

/**
 * One of the 16 water tiles, selected by a bitmask of which sides border water
 * (WATER_EDGE). Each side *without* water gets a strip of grass margin, so a body's
 * edges and corners read as banked shoreline against the lawn rather than a hard blue
 * square. Mask 15 (surrounded by water) is a full interior tile with no margin.
 */
function waterTile(mask: number): Sprite {
  const landN = (mask & WATER_EDGE.N) === 0;
  const landE = (mask & WATER_EDGE.E) === 0;
  const landS = (mask & WATER_EDGE.S) === 0;
  const landW = (mask & WATER_EDGE.W) === 0;
  return overlayShape(grassTile(6), WATER_COLORS, (x, y) => {
    if (landN && y < WATER_MARGIN) return 0; // keep grass margin on a land side
    if (landS && y >= TILE - WATER_MARGIN) return 0;
    if (landW && x < WATER_MARGIN) return 0;
    if (landE && x >= TILE - WATER_MARGIN) return 0;
    return waterPixel(x, y);
  });
}

/**
 * Composite an authored object (transparent where '.') over a ground tile, merging
 * palettes. Lets the flower/tree sit on real grass texture without re-authoring the
 * background per object.
 */
function overlay(base: Sprite, rows: readonly string[], legend: Record<string, string>): Sprite {
  const obj = sprite(rows, legend);
  if (obj.w !== base.w || obj.h !== base.h) {
    throw new Error('overlay: object and base sprite dimensions differ');
  }
  const palette = [...base.palette];
  const remap = [0];
  for (let i = 1; i < obj.palette.length; i++) {
    remap[i] = palette.length;
    palette.push(obj.palette[i]);
  }
  const pixels = base.pixels.map((bp, i) => (obj.pixels[i] === 0 ? bp : remap[obj.pixels[i]]));
  return { w: base.w, h: base.h, palette, pixels };
}

/**
 * Composite a procedural shape over a base tile: `at(x,y)` returns 0 to keep the
 * base pixel, or a 1-based index into `colors` to paint that colour. The overlay
 * sibling to `overlay()` — used for the soil patches, whose round/rectangular masks
 * are far cleaner as math than as hand-authored char grids.
 */
function overlayShape(
  base: Sprite,
  colors: readonly string[],
  at: (x: number, y: number) => number,
): Sprite {
  const palette = [...base.palette];
  const remap = [0, ...colors.map((c) => palette.push(c) - 1)];
  const pixels = base.pixels.map((bp, i) => {
    const idx = at(i % TILE, Math.floor(i / TILE));
    return idx === 0 ? bp : remap[idx];
  });
  return { w: base.w, h: base.h, palette, pixels };
}

// Bare earth under the plants (lawnmower.md §3): trees and flowers were near-
// invisible as green-on-green, so each sits on a speckled brown soil patch that
// reads clearly against the lawn — a round patch for trees, a rectangular bed for
// flowers, so the two are distinguishable at a glance. Both leave a green margin.
const SOIL: readonly string[] = ['#6b4a2a', '#573a20', '#7d5836']; // base, dark clod, light fleck

/** Soil colour index for a pixel: mostly base, speckled with dark/light for texture. */
function soilPixel(x: number, y: number, seed: number): number {
  const n = noise(x, y, seed + 31);
  if (n > 0.82) return 3; // light fleck
  if (n < 0.22) return 2; // dark clod
  return 1; // base
}

/** A round patch of soil over grass, leaving a ~2px green margin (for trees). */
function soilDisc(seed: number): Sprite {
  const cx = 8;
  const cy = 8;
  const r2 = 6.2 * 6.2;
  return overlayShape(grassTile(seed), SOIL, (x, y) => {
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    return dx * dx + dy * dy <= r2 ? soilPixel(x, y, seed) : 0;
  });
}

/** A rectangular soil bed over grass with clipped corners, leaving a green margin (for flowers). */
function soilBed(seed: number): Sprite {
  const x0 = 2;
  const x1 = 13;
  const y0 = 5;
  const y1 = 13;
  return overlayShape(grassTile(seed), SOIL, (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return 0;
    // Clip the four corners so it reads as a bed, not a hard-edged rectangle — and
    // stays a distinctly different shape from the tree's round disc.
    if ((x === x0 || x === x1) && (y === y0 || y === y1)) return 0;
    return soilPixel(x, y, seed);
  });
}

// --- Grass variants (picked per-cell for texture variety) ------------------
const grassUnmowed: readonly Sprite[] = [grassTile(1), grassTile(2)];
const grassMowed = mownTile();
const path = pathTile();

// --- Obstacle variants (lake / flower / tree, picked per-cell) --------------
// A flower rising from a rectangular soil bed. Stem roots down into the bed so the
// bloom reads as planted, not floating on grass.
// prettier-ignore
const flower = overlay(soilBed(3), [
  '................',
  '................',
  '......ppp.......',
  '.....pPPPp......',
  '.....pPyPp......',
  '......pPp.......',
  '.......s........',
  '......Lss.......',
  '.......ssL......',
  '......Lss.......',
  '.......s........',
  '.......s........',
  '................',
  '................',
  '................',
  '................',
], { p: '#e88fb0', P: '#d76fa0', y: '#f2d64b', s: '#3f6f28', L: '#4c8236' });

// A tree: leafy green canopy on a trunk, standing on a round soil disc. The disc
// shows as a brown ring around and below the canopy, so the tile can't be mistaken
// for plain grass. Trunk is a dark bark brown so it reads against the lighter soil.
// A daisy: white petals around a yellow eye, on its bed.
// prettier-ignore
const daisy = overlay(soilBed(7), [
  '................',
  '................',
  '......www.......',
  '.....wwwww......',
  '.....wwyww......',
  '.....wwwww......',
  '......www.......',
  '.......s........',
  '......Lss.......',
  '.......ssL......',
  '.......s........',
  '.......s........',
  '................',
  '................',
  '................',
  '................',
], { w: '#f2efe6', y: '#f2d64b', s: '#3f6f28', L: '#4c8236' });

// A cluster of bluebells, on its bed.
// prettier-ignore
const bluebell = overlay(soilBed(9), [
  '................',
  '................',
  '......bbb.......',
  '.....bBBBb......',
  '.....BBBBB......',
  '......BBB.......',
  '.......s........',
  '......Lss.......',
  '.......ssL......',
  '......Lss.......',
  '.......s........',
  '.......s........',
  '................',
  '................',
  '................',
  '................',
], { b: '#c9a6e0', B: '#9a6fc0', s: '#3f6f28', L: '#4c8236' });

// A tree: leafy green canopy on a trunk, standing on a round soil disc. The disc
// shows as a brown ring around and below the canopy, so the tile can't be mistaken
// for plain grass. Trunk is a dark bark brown so it reads against the lighter soil.
// prettier-ignore
const roundTree = overlay(soilDisc(4), [
  '................',
  '......mmmm......',
  '.....mMMMMm.....',
  '....mMMMMMMm....',
  '....mMMMMMMm....',
  '....mMMMMMMm....',
  '.....mMMMMm.....',
  '......mmmm......',
  '.......tt.......',
  '.......tt.......',
  '.......tt.......',
  '................',
  '................',
  '................',
  '................',
  '................',
], { m: '#4c8236', M: '#356024', t: '#4a3218' });

// A conifer: a layered triangular canopy — a clearly different silhouette from the
// round tree — on its soil disc.
// prettier-ignore
const pineTree = overlay(soilDisc(8), [
  '................',
  '.......P........',
  '......PPP.......',
  '......ppp.......',
  '.....PPPPP......',
  '.....ppppp......',
  '....PPPPPPP.....',
  '....ppppppp.....',
  '.......tt.......',
  '.......tt.......',
  '.......tt.......',
  '................',
  '................',
  '................',
  '................',
  '................',
], { P: '#3a7a3f', p: '#276030', t: '#4a3218' });

// Water/tree/flower are exposed as named sets so the renderer can map a cell's
// decor (lawnmower.md §3) to the right art, rather than picking blindly by hash.
// `water` is indexed by a WATER_EDGE bitmask of which neighbours are water, so a
// body's edges/corners bank onto the lawn; index 15 is the full interior tile.
const water: readonly Sprite[] = Array.from({ length: 16 }, (_, mask) => waterTile(mask));
const trees: readonly Sprite[] = [roundTree, pineTree];
const flowers: readonly Sprite[] = [flower, daisy, bluebell];

// Fountains (lawnmower.md §3): a stone basin with a little jet and falling droplets.
// The same structure sits in a full water tile (a fountain in a pond) or on a soil
// patch (a fountain on the lawn), so both fountain kinds read as the same feature.
// prettier-ignore
const fountainRows = [
  '................',
  '.......dd.......',
  '......d..d......',
  '.......jj.......',
  '.......jj.......',
  '....SSSSSSSS....',
  '....SWWWWWWS....',
  '....SWwwwwWS....',
  '....SWWWWWWS....',
  '....SSSSSSSS....',
  '.....ssssss.....',
  '................',
  '................',
  '................',
  '................',
  '................',
];
const fountainLegend = {
  d: '#a9d3f0', // droplet
  j: '#8fc0ea', // jet
  S: '#c9c2b8', // stone rim (light)
  s: '#8f887d', // stone base (shadow)
  W: '#6ea3d6', // basin water (light)
  w: '#3f6f9e', // basin water (deep)
};
const waterFountain = overlay(water[15], fountainRows, fountainLegend);
const lawnFountain = overlay(soilDisc(2), fountainRows, fountainLegend);

// Fallback pool for obstacle cells that carry no decor (hand-authored/ascii levels):
// the old blind per-cell hash pick, preserving their original look. Uses the full
// water tile as the lake representative.
const obstacles: readonly Sprite[] = [water[15], flower, roundTree];

// --- Mower (authored facing up, rotated for the other three headings) -------
// prettier-ignore
const mowerUp = sprite([
  '................',
  '....cccccccc....',
  '...cCCCCCCCCc...',
  '...rrrrrrrrrr...',
  '..krRRRRRRRRrk..',
  '..krrrrrrrrrrk..',
  '..krrrrrrrrrrk..',
  '..krRRRRRRRRrk..',
  '...rrrrrrrrrr...',
  '....rrrrrrrr....',
  '.....hhhhhh.....',
  '......hhhh......',
  '.......hh.......',
  '.......hh.......',
  '................',
  '................',
], { c: '#f2c14e', C: '#d99a2e', r: '#d94c3d', R: '#b23a2d', k: '#2a2a2a', h: '#c9b98f' });

const mowerRight = rotateCW(mowerUp);
const mowerDown = rotateCW(mowerRight);
const mowerLeft = rotateCW(mowerDown);

const mower: Record<InputDirection, Sprite> = {
  up: mowerUp,
  right: mowerRight,
  down: mowerDown,
  left: mowerLeft,
};

/** The garden theme's complete sprite set, consumed by gardenTheme in theme.ts. */
export const gardenSprites = {
  grassUnmowed,
  grassMowed,
  path,
  water,
  trees,
  flowers,
  waterFountain,
  lawnFountain,
  obstacles,
  mower,
} as const;
