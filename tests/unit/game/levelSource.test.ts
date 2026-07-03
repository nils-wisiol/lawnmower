import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LEVEL_CODE,
  bootLevel,
  defaultCodedLevel,
  levelFromCode,
  randomLevel,
} from '../../../src/game/defaultLevel.ts';
import { levelFromShortForm } from '../../../src/gen/index.ts';
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
    const coded = bootLevel('#1.42.10x8.70');
    expect(coded.code).toBe('1.42.10x8.70');
  });

  it('boots the default level when the hash is empty', () => {
    expect(bootLevel('').code).toBe(DEFAULT_LEVEL_CODE);
    expect(bootLevel('#').code).toBe(DEFAULT_LEVEL_CODE);
  });

  it('falls back to the default when a hash code is unusable', () => {
    expect(bootLevel('#garbage').code).toBe(DEFAULT_LEVEL_CODE);
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
