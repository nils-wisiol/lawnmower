import { describe, expect, it } from 'vitest';

import { cellFill } from '../../../src/render/canvasRenderer.ts';
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
});
