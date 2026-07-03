import { describe, expect, it, vi } from 'vitest';

import { attachKeyboard, inputForKey, isRestartKey } from '../../../src/input/keyboard.ts';

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

  it('returns undefined for non-movement keys', () => {
    expect(inputForKey('x')).toBeUndefined();
    expect(inputForKey('Enter')).toBeUndefined();
  });
});

describe('isRestartKey', () => {
  it('recognises R / Enter / Space', () => {
    expect(isRestartKey('r')).toBe(true);
    expect(isRestartKey('R')).toBe(true);
    expect(isRestartKey('Enter')).toBe(true);
    expect(isRestartKey(' ')).toBe(true);
    expect(isRestartKey('q')).toBe(false);
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
});
