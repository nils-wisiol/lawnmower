import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LEVEL_CODE,
  bootLevel,
  defaultCodedLevel,
  fitLevelSize,
  levelFromCode,
  randomLevel,
} from '../../../src/game/defaultLevel.ts';
import { GENERATOR_VERSION, levelFromShortForm } from '../../../src/gen/index.ts';
import { TUTORIAL_CODE } from '../../../src/game/tutorial.ts';
import { countMowable } from '../../../src/model/index.ts';

describe('levelFromCode — expanding a shared code', () => {
  it('expands a valid code and carries it back for sharing', () => {
    const coded = levelFromCode(DEFAULT_LEVEL_CODE);
    expect(coded.code).toBe(DEFAULT_LEVEL_CODE);
    // Reproduces the same level as decoding the code directly (a shared seed
    // reproduces a level — the M5 done-criterion).
    const direct = levelFromShortForm(DEFAULT_LEVEL_CODE);
    expect(countMowable(coded.level)).toBe(countMowable(direct));
    expect(coded.level.topology.cells.length).toBe(direct.topology.cells.length);
  });

  it('falls back to the default level on a malformed code', () => {
    const coded = levelFromCode('not-a-real-code');
    expect(coded.code).toBe(DEFAULT_LEVEL_CODE);
  });

  it('falls back on an unsupported generator version (a future link)', () => {
    const coded = levelFromCode('999.42.10x8.70');
    expect(coded.code).toBe(DEFAULT_LEVEL_CODE);
  });
});

describe('bootLevel — choosing the level to boot from a hash', () => {
  it('uses the shared code when the hash carries one', () => {
    const code = `${GENERATOR_VERSION}.42.10x8.70`;
    const coded = bootLevel(`#${code}`);
    expect(coded.code).toBe(code);
  });

  it('boots the default level when the hash is empty', () => {
    expect(bootLevel('').code).toBe(DEFAULT_LEVEL_CODE);
    expect(bootLevel('#').code).toBe(DEFAULT_LEVEL_CODE);
  });

  it('falls back to the default when a hash code is unusable', () => {
    expect(bootLevel('#garbage').code).toBe(DEFAULT_LEVEL_CODE);
  });

  it('resolves the reserved #tutorial hash to the tutorial lawn', () => {
    expect(bootLevel('#tutorial').code).toBe(TUTORIAL_CODE);
  });
});

describe('fitLevelSize — level proportions follow the screen', () => {
  it('gives a portrait phone a taller-than-wide lawn', () => {
    const size = fitLevelSize({ width: 390, height: 844 });
    expect(size.height).toBeGreaterThan(size.width);
  });

  it('gives a landscape screen a wider-than-tall lawn', () => {
    const size = fitLevelSize({ width: 1024, height: 600 });
    expect(size.width).toBeGreaterThan(size.height);
  });

  it('does not grow into a superlarge lawn on a big desktop (clamped)', () => {
    const size = fitLevelSize({ width: 3840, height: 2160 });
    expect(size.width).toBeLessThanOrEqual(14);
    expect(size.height).toBeLessThanOrEqual(12);
  });

  it('stays playable on a tiny screen (clamped to a floor)', () => {
    const size = fitLevelSize({ width: 240, height: 320 });
    expect(size.width).toBeGreaterThanOrEqual(6);
    expect(size.height).toBeGreaterThanOrEqual(6);
  });
});

describe('defaultCodedLevel & randomLevel', () => {
  it('the default level carries its short-form code', () => {
    expect(defaultCodedLevel().code).toBe(DEFAULT_LEVEL_CODE);
  });

  it('a random level is shareable and reproducible from its own code', () => {
    const coded = randomLevel();
    expect(coded.code).toBeDefined();
    // The code it advertises re-expands to an equivalent level.
    const again = levelFromCode(coded.code!);
    expect(again.level.topology.cells.length).toBe(coded.level.topology.cells.length);
    expect(countMowable(again.level)).toBe(countMowable(coded.level));
  });
});
