// Indexed-palette pixel-art sprites (lawnmower.md §3): art authored as code/data,
// bundled inline (no external binary assets), so the app stays self-contained for
// static hosting. A Sprite is a small matrix of palette indices; the renderer
// scales it into a cell with nearest-neighbour rects for crisp integer pixels.
// This is the format the theme layer exposes — swapping the art is a data swap,
// not a renderer change (§5 theming layer).

import type { CellId } from '../model/index.ts';

/**
 * A pixel-art image as an indexed-palette matrix. `pixels` is row-major, length
 * `w * h`, each entry an index into `palette`. Index 0 is reserved for
 * transparent, so sprites can be layered (a mower over grass) — `palette[0]` is a
 * placeholder and never drawn.
 */
export interface Sprite {
  readonly w: number;
  readonly h: number;
  readonly palette: readonly string[];
  readonly pixels: readonly number[];
}

/** Chars that mean "transparent" in an authored sprite row. */
const TRANSPARENT_CHARS = new Set(['.', ' ']);

/**
 * Author a Sprite from char-grid rows plus a `char → CSS color` legend, so pixel
 * art reads legibly in source. `.` and space are transparent. Every row must have
 * equal width; an unmapped, non-transparent char throws (catches art typos early).
 */
export function sprite(rows: readonly string[], legend: Readonly<Record<string, string>>): Sprite {
  const h = rows.length;
  if (h === 0) throw new Error('Sprite has no rows');
  const w = rows[0].length;

  // Index 0 is the reserved transparent slot; real colors get indices 1..n as
  // they're first seen, deduped per distinct legend char.
  const palette: string[] = ['#00000000'];
  const indexOf = new Map<string, number>();
  const pixels: number[] = [];

  for (let y = 0; y < h; y++) {
    const row = rows[y];
    if (row.length !== w) {
      throw new Error(`Sprite row ${y} has width ${row.length}, expected ${w}`);
    }
    for (const ch of row) {
      if (TRANSPARENT_CHARS.has(ch)) {
        pixels.push(0);
        continue;
      }
      let idx = indexOf.get(ch);
      if (idx === undefined) {
        const color = legend[ch];
        if (color === undefined) throw new Error(`Unknown sprite char "${ch}"`);
        idx = palette.length;
        palette.push(color);
        indexOf.set(ch, idx);
      }
      pixels.push(idx);
    }
  }

  return { w, h, palette, pixels };
}

/**
 * A canvas 2D-context subset — just what drawSprite writes to. Declared locally so
 * the geometry is unit-testable with a recording stub instead of a real canvas.
 */
export interface SpriteTarget {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
}

/**
 * Draw `s` scaled into the `size`×`size` box at (`px`,`py`). Each source pixel
 * becomes an integer-rounded rect so adjacent pixels tile seamlessly at any scale
 * (no sub-pixel gaps). Transparent pixels (index 0) are skipped.
 */
export function drawSprite(
  target: SpriteTarget,
  s: Sprite,
  px: number,
  py: number,
  size: number,
): void {
  const { w, h, palette, pixels } = s;
  for (let row = 0; row < h; row++) {
    const y0 = py + Math.round((row * size) / h);
    const y1 = py + Math.round(((row + 1) * size) / h);
    for (let col = 0; col < w; col++) {
      const idx = pixels[row * w + col];
      if (idx === 0) continue;
      const x0 = px + Math.round((col * size) / w);
      const x1 = px + Math.round(((col + 1) * size) / w);
      target.fillStyle = palette[idx];
      target.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
}

/**
 * Rotate a sprite 90° clockwise. Used to derive the mower's four facings from a
 * single authored heading, so the four directional sprites can't drift apart.
 */
export function rotateCW(s: Sprite): Sprite {
  const { w, h, palette, pixels } = s;
  const out = new Array<number>(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // (x,y) → (h-1-y, x) in the new h×w grid.
      const nx = h - 1 - y;
      const ny = x;
      out[ny * h + nx] = pixels[y * w + x];
    }
  }
  return { w: h, h: w, palette, pixels: out };
}

/**
 * Deterministic FNV-1a hash of a cell id, for stable per-cell visual variety
 * (which grass tuft / obstacle a cell shows). Deterministic so the same lawn
 * always looks the same across redraws and reloads.
 */
export function hashCell(cell: CellId): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < cell.length; i++) {
    h ^= cell.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Pick a stable element of `variants` for `cell` (empty → undefined). */
export function variantFor<T>(variants: readonly T[], cell: CellId): T | undefined {
  if (variants.length === 0) return undefined;
  return variants[hashCell(cell) % variants.length];
}
