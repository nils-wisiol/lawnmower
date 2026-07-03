import { describe, expect, it } from 'vitest';

import {
  HexGrid,
  hexLevelFromAscii,
  offsetCellId,
  traitsOf,
  type CellId,
} from '../../../src/model/index.ts';

// The hex authoring helper (hexagonal.md H4) reads a plain rectangular char grid as an
// odd-q offset hex board, so small hex fixtures — ponds, shorelines — are as readable
// to hand-author as square ones. These lock in the mapping and the error handling it
// shares with `levelFromAscii`.
describe('hexLevelFromAscii', () => {
  it('builds a flat-top hex board of the char grid’s width × height', () => {
    const level = hexLevelFromAscii('S.\n..\n..');
    expect(level.topology).toBeInstanceOf(HexGrid);
    // 2 columns × 3 rows → the same six cells HexGrid mints for that size.
    expect(new Set(level.topology.cells)).toEqual(new Set(new HexGrid(2, 3).cells));
  });

  it('places the start at the S char’s offset (col, row)', () => {
    const level = hexLevelFromAscii('..\n.S');
    expect(level.start).toBe(offsetCellId(1, 1));
  });

  it('maps each legend char onto its traits at the right cell', () => {
    //  col0 col1
    //   S    #     row0
    //   .    P     row1
    const level = hexLevelFromAscii('S#\n.P');
    expect(traitsOf(level, offsetCellId(0, 0))).toEqual({ passable: true, mowable: true });
    expect(traitsOf(level, offsetCellId(1, 0))).toEqual({ passable: false, mowable: false });
    expect(traitsOf(level, offsetCellId(0, 1))).toEqual({ passable: true, mowable: true });
    expect(traitsOf(level, offsetCellId(1, 1))).toEqual({ passable: true, mowable: false });
  });

  it('reads a vertical run of chars in one column as an N–S line of hexes', () => {
    // Column 0 top-to-bottom are N–S neighbours, so this authors a 1×3 vertical body.
    const level = hexLevelFromAscii('S\n#\n#');
    const top = offsetCellId(0, 0);
    const mid = offsetCellId(0, 1);
    const bot = offsetCellId(0, 2);
    expect(level.topology.neighbor(top, 'S')).toBe(mid);
    expect(level.topology.neighbor(mid, 'S')).toBe(bot);
    expect(level.topology.neighbor(mid, 'N')).toBe(top);
  });

  it('gives every parsed cell traits (no cell left undefined)', () => {
    const level = hexLevelFromAscii('S.#\n..P\n#..');
    for (const cell of level.topology.cells) {
      expect(() => traitsOf(level, cell)).not.toThrow();
    }
  });

  it('rejects an empty map', () => {
    expect(() => hexLevelFromAscii('')).toThrow(/empty/i);
  });

  it('rejects ragged rows', () => {
    expect(() => hexLevelFromAscii('S..\n..')).toThrow(/width/i);
  });

  it('rejects an unknown char', () => {
    expect(() => hexLevelFromAscii('S.\n.x')).toThrow(/unknown/i);
  });

  it('rejects a map with no start', () => {
    expect(() => hexLevelFromAscii('..\n..')).toThrow(/no start/i);
  });

  it('rejects a map with more than one start', () => {
    expect(() => hexLevelFromAscii('S.\nS.')).toThrow(/more than one/i);
  });
});

// A worked shoreline fixture: the hex ascii helper is what makes hand-made hex water
// bodies (with an explicit decor map) readable in a test.
describe('hexLevelFromAscii — authoring a hex water body', () => {
  it('yields a level a decor map can turn into a banked hex pond', () => {
    //  S .        row0
    //   . #       row1  (# = the pond cell)
    //  . .        row2
    const level = hexLevelFromAscii('S.\n.#\n..');
    const pond: CellId = offsetCellId(1, 1);
    expect(traitsOf(level, pond).passable).toBe(false);
    // The pond is a real board cell whose six directions are addressable for shoreline.
    expect(level.topology.cells).toContain(pond);
  });
});
