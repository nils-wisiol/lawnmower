import { describe, expect, it, vi } from 'vitest';

import {
  levelHash,
  pushLevelHash,
  readLevelCode,
  syncLevelHash,
  type HistoryLike,
} from '../../../src/game/levelUrl.ts';

describe('levelUrl — reading a code from a hash', () => {
  it('reads the code from a raw location.hash (leading #)', () => {
    expect(readLevelCode('#1.20260703.12x9.70')).toBe('1.20260703.12x9.70');
  });

  it('accepts a bare code without a leading #', () => {
    expect(readLevelCode('1.42.10x8.70')).toBe('1.42.10x8.70');
  });

  it('trims surrounding whitespace', () => {
    expect(readLevelCode('#  1.42.10x8.70  ')).toBe('1.42.10x8.70');
  });

  it('returns undefined for an empty or bare-# hash', () => {
    expect(readLevelCode('')).toBeUndefined();
    expect(readLevelCode('#')).toBeUndefined();
    expect(readLevelCode('#   ')).toBeUndefined();
  });
});

describe('levelUrl — building & syncing the hash', () => {
  it('builds a hash fragment with a leading #', () => {
    expect(levelHash('1.42.10x8.70')).toBe('#1.42.10x8.70');
  });

  it('round-trips: readLevelCode(levelHash(code)) === code', () => {
    const code = '1.999.20x15.55';
    expect(readLevelCode(levelHash(code))).toBe(code);
  });

  it('syncs via replaceState so no back-button history is added', () => {
    const history: HistoryLike = { replaceState: vi.fn(), pushState: vi.fn() };
    syncLevelHash(history, '1.42.10x8.70');
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '#1.42.10x8.70');
    expect(history.pushState).not.toHaveBeenCalled();
  });

  it('pushes a back-button entry via pushState when moving to a new level', () => {
    const history: HistoryLike = { replaceState: vi.fn(), pushState: vi.fn() };
    pushLevelHash(history, '1.42.10x8.70');
    expect(history.pushState).toHaveBeenCalledWith(null, '', '#1.42.10x8.70');
    expect(history.replaceState).not.toHaveBeenCalled();
  });
});
