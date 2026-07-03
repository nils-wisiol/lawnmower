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

/** A lake obstacle: blue water with banded ripples and sparkle highlights. */
function lakeTile(): Sprite {
  return buildTile(['#3f6f9e', '#35608f', '#6ea3d6'], (x, y) => {
    const n = noise(x, y, 7);
    if (n > 0.9) return 3; // sparkle
    // Gentle horizontal ripple bands, offset per row for a watery feel.
    if ((y + Math.floor(noise(0, y, 2) * 3)) % 4 === 0) return 2;
    return 1;
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

// --- Grass variants (picked per-cell for texture variety) ------------------
const grassUnmowed: readonly Sprite[] = [grassTile(1), grassTile(2)];
const grassMowed = mownTile();
const path = pathTile();

// --- Obstacle variants (lake / flower / tree, picked per-cell) --------------
// prettier-ignore
const flower = overlay(grassTile(3), [
  '................',
  '................',
  '......ppp.......',
  '.....pPPPp......',
  '.....pPyPp......',
  '......pPp.......',
  '.......s........',
  '.......s........',
  '......ss........',
  '.......s........',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
], { p: '#e88fb0', P: '#d76fa0', y: '#f2d64b', s: '#4c8236' });

// prettier-ignore
const tree = overlay(grassTile(4), [
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
], { m: '#4c8236', M: '#356024', t: '#6b4a2a' });

const obstacles: readonly Sprite[] = [lakeTile(), flower, tree];

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
  obstacles,
  mower,
} as const;
