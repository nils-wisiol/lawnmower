import { describe, expect, it } from 'vitest';

import {
  drawSprite,
  hashCell,
  rotateCW,
  sprite,
  variantFor,
  type SpriteTarget,
} from '../../../src/render/sprite.ts';

/** Records every fillRect drawn, with the fillStyle in force at the time. */
function recordingTarget(): SpriteTarget & {
  rects: { x: number; y: number; w: number; h: number; color: string }[];
} {
  const rects: { x: number; y: number; w: number; h: number; color: string }[] = [];
  return {
    fillStyle: '#000',
    fillRect(x, y, w, h) {
      rects.push({ x, y, w, h, color: this.fillStyle as string });
    },
    rects,
  };
}

describe('sprite() authoring', () => {
  it('maps chars to a palette with index 0 reserved for transparent', () => {
    const s = sprite(['ab', 'ba'], { a: '#f00', b: '#0f0' });
    expect(s.w).toBe(2);
    expect(s.h).toBe(2);
    expect(s.palette[0]).not.toBe('#f00'); // slot 0 is the transparent placeholder
    // Two distinct colours → indices 1 and 2, deduped and reused.
    expect(new Set(s.pixels)).toEqual(new Set([1, 2]));
    expect(s.palette[s.pixels[0]]).toBe('#f00');
  });

  it("treats '.' and space as transparent (index 0)", () => {
    const s = sprite(['a.', ' a'], { a: '#f00' });
    expect(s.pixels).toEqual([1, 0, 0, 1]);
  });

  it('rejects rows of unequal width', () => {
    expect(() => sprite(['aa', 'a'], { a: '#f00' })).toThrow();
  });

  it('rejects an unmapped, non-transparent char', () => {
    expect(() => sprite(['x'], { a: '#f00' })).toThrow(/Unknown sprite char/);
  });
});

describe('drawSprite() scaling', () => {
  it('skips transparent pixels and tiles opaque ones seamlessly', () => {
    // A 2x2 with one opaque pixel (top-left) scaled into a 10px box.
    const s = sprite(['a.', '..'], { a: '#f00' });
    const target = recordingTarget();
    drawSprite(target, s, 0, 0, 10);
    expect(target.rects).toHaveLength(1);
    const r = target.rects[0];
    expect(r.color).toBe('#f00');
    expect({ x: r.x, y: r.y, w: r.w, h: r.h }).toEqual({ x: 0, y: 0, w: 5, h: 5 });
  });

  it('rounds pixel boundaries so adjacent pixels leave no gap', () => {
    // Two horizontally adjacent opaque pixels over an odd (15px) box: the seam
    // between them must be shared (pixel 0 ends exactly where pixel 1 begins).
    const s = sprite(['aa'], { a: '#f00' });
    const target = recordingTarget();
    drawSprite(target, s, 0, 0, 15);
    const [left, right] = target.rects.sort((p, q) => p.x - q.x);
    expect(left.x + left.w).toBe(right.x);
    expect(right.x + right.w).toBe(15);
  });
});

describe('rotateCW()', () => {
  it('turns an up-pointing mark into a right-pointing one', () => {
    // A single lit pixel at top-centre should land at right-centre after a CW turn.
    const s = sprite(['.a.', '...', '...'], { a: '#f00' });
    const r = rotateCW(s);
    // top-centre (col 1,row 0) → (col 2,row 1) in the rotated grid.
    expect(r.pixels[1 * 3 + 2]).toBe(s.pixels[0 * 3 + 1]);
  });
});

describe('hashCell() / variantFor()', () => {
  it('is deterministic for a given cell id', () => {
    expect(hashCell('3,4')).toBe(hashCell('3,4'));
    expect(hashCell('3,4')).not.toBe(hashCell('4,3'));
  });

  it('picks a stable variant per cell, undefined for an empty set', () => {
    const variants = ['a', 'b', 'c'];
    expect(variantFor(variants, '7,2')).toBe(variantFor(variants, '7,2'));
    expect(variantFor([], '7,2')).toBeUndefined();
  });
});
