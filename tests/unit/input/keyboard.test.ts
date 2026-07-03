import { describe, expect, it, vi } from 'vitest';

import {
  attachKeyboard,
  inputForKey,
  isAdvanceKey,
  isRestartKey,
} from '../../../src/input/keyboard.ts';

describe('inputForKey', () => {
  it('maps arrow keys and WASD to the four intents', () => {
    expect(inputForKey('ArrowUp')).toBe('up');
    expect(inputForKey('ArrowDown')).toBe('down');
    expect(inputForKey('ArrowLeft')).toBe('left');
    expect(inputForKey('ArrowRight')).toBe('right');
    expect(inputForKey('w')).toBe('up');
    expect(inputForKey('a')).toBe('left');
    expect(inputForKey('D')).toBe('right');
  });

  it('maps Q/E/Z/C to the four hex diagonals (both cases)', () => {
    expect(inputForKey('q')).toBe('upLeft');
    expect(inputForKey('Q')).toBe('upLeft');
    expect(inputForKey('e')).toBe('upRight');
    expect(inputForKey('E')).toBe('upRight');
    expect(inputForKey('z')).toBe('downLeft');
    expect(inputForKey('Z')).toBe('downLeft');
    expect(inputForKey('c')).toBe('downRight');
    expect(inputForKey('C')).toBe('downRight');
  });

  it('returns undefined for non-movement keys', () => {
    expect(inputForKey('x')).toBeUndefined();
    expect(inputForKey('Enter')).toBeUndefined();
  });
});

describe('isRestartKey', () => {
  it('recognises only R (retry the same level), not the advance keys', () => {
    expect(isRestartKey('r')).toBe(true);
    expect(isRestartKey('R')).toBe(true);
    expect(isRestartKey('Enter')).toBe(false);
    expect(isRestartKey(' ')).toBe(false);
    expect(isRestartKey('q')).toBe(false);
  });
});

describe('isAdvanceKey', () => {
  it('recognises Enter / Space / N (continue — next level or retry)', () => {
    expect(isAdvanceKey('Enter')).toBe(true);
    expect(isAdvanceKey(' ')).toBe(true);
    expect(isAdvanceKey('n')).toBe(true);
    expect(isAdvanceKey('N')).toBe(true);
    expect(isAdvanceKey('r')).toBe(false);
    expect(isAdvanceKey('q')).toBe(false);
  });
});

// A minimal EventTarget stand-in so we can exercise attachKeyboard without a DOM.
function fakeTarget() {
  let listener: ((e: KeyboardEvent) => void) | undefined;
  return {
    addEventListener: (_: string, l: EventListener) => {
      listener = l as (e: KeyboardEvent) => void;
    },
    removeEventListener: () => {
      listener = undefined;
    },
    fire: (e: Partial<KeyboardEvent>) =>
      listener?.({ preventDefault: () => {}, ...e } as KeyboardEvent),
    get attached() {
      return listener !== undefined;
    },
  };
}

describe('attachKeyboard', () => {
  it('drops key-repeat events so a held key never auto-advances (no key-repeat, §5)', () => {
    const target = fakeTarget();
    const onMove = vi.fn();
    attachKeyboard(target as unknown as HTMLElement, { onMove, onRestart: vi.fn() });

    target.fire({ key: 'ArrowRight', repeat: false });
    target.fire({ key: 'ArrowRight', repeat: true }); // held → ignored
    target.fire({ key: 'ArrowRight', repeat: false });

    expect(onMove).toHaveBeenCalledTimes(2);
    expect(onMove).toHaveBeenCalledWith('right');
  });

  it('routes restart keys and detaches cleanly', () => {
    const target = fakeTarget();
    const onRestart = vi.fn();
    const detach = attachKeyboard(target as unknown as HTMLElement, { onMove: vi.fn(), onRestart });

    target.fire({ key: 'r', repeat: false });
    expect(onRestart).toHaveBeenCalledTimes(1);

    detach();
    expect(target.attached).toBe(false);
  });

  it('routes advance keys to onAdvance without touching onRestart', () => {
    const target = fakeTarget();
    const onRestart = vi.fn();
    const onAdvance = vi.fn();
    attachKeyboard(target as unknown as HTMLElement, {
      onMove: vi.fn(),
      onRestart,
      onAdvance,
    });

    target.fire({ key: 'Enter', repeat: false });
    target.fire({ key: 'n', repeat: false });

    expect(onAdvance).toHaveBeenCalledTimes(2);
    expect(onRestart).not.toHaveBeenCalled();
  });
});
