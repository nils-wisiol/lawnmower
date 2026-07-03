import { describe, expect, it, vi } from 'vitest';

import { HexGrid, type InputDirection } from '../../../src/model/index.ts';
import { attachSwipe, DEFAULT_SWIPE_THRESHOLD, swipeDirection } from '../../../src/input/swipe.ts';

// The six intents a flat-top hex accepts, derived exactly as the app does (filtering
// the intent superset by what the topology maps) so the sector test can't drift.
const ALL_INPUTS: readonly InputDirection[] = [
  'up',
  'down',
  'left',
  'right',
  'upLeft',
  'upRight',
  'downLeft',
  'downRight',
];
const hex = new HexGrid(4, 4);
const HEX_INTENTS = ALL_INPUTS.filter((i) => hex.directionForInput(i) !== undefined);

describe('swipeDirection', () => {
  it('maps the dominant axis of travel to the four intents', () => {
    const far = DEFAULT_SWIPE_THRESHOLD + 10;
    expect(swipeDirection(far, 0)).toBe('right');
    expect(swipeDirection(-far, 0)).toBe('left');
    expect(swipeDirection(0, far)).toBe('down');
    expect(swipeDirection(0, -far)).toBe('up');
  });

  it('uses the larger axis when a swipe is diagonal', () => {
    expect(swipeDirection(40, 15)).toBe('right'); // mostly horizontal
    expect(swipeDirection(15, -40)).toBe('up'); // mostly vertical
  });

  it('resolves a perfect diagonal to the horizontal axis (square tie-break)', () => {
    expect(swipeDirection(40, 40)).toBe('right');
    expect(swipeDirection(-40, -40)).toBe('left');
  });

  it('returns undefined for a sub-threshold gesture (a tap, not a swipe)', () => {
    expect(swipeDirection(0, 0)).toBeUndefined();
    expect(
      swipeDirection(DEFAULT_SWIPE_THRESHOLD - 1, DEFAULT_SWIPE_THRESHOLD - 1),
    ).toBeUndefined();
  });

  it('honours a custom threshold', () => {
    expect(swipeDirection(30, 0, 50)).toBeUndefined();
    expect(swipeDirection(60, 0, 50)).toBe('right');
  });

  it('classifies into six 60° sectors for the hex intent set', () => {
    const t = DEFAULT_SWIPE_THRESHOLD;
    // Straight up/down, then the four flat-top diagonals (±30° off horizontal).
    expect(swipeDirection(0, -2 * t, t, HEX_INTENTS)).toBe('up');
    expect(swipeDirection(0, 2 * t, t, HEX_INTENTS)).toBe('down');
    expect(swipeDirection(2 * t, -t, t, HEX_INTENTS)).toBe('upRight');
    expect(swipeDirection(2 * t, t, t, HEX_INTENTS)).toBe('downRight');
    expect(swipeDirection(-2 * t, -t, t, HEX_INTENTS)).toBe('upLeft');
    expect(swipeDirection(-2 * t, t, t, HEX_INTENTS)).toBe('downLeft');
  });

  it('never yields left/right on hex (a flat-top hex has no pure E/W)', () => {
    // A pure horizontal swipe still resolves to a hex heading, never the unmapped
    // left/right — it lands on whichever adjacent diagonal wins the tie.
    const dir = swipeDirection(
      3 * DEFAULT_SWIPE_THRESHOLD,
      0,
      DEFAULT_SWIPE_THRESHOLD,
      HEX_INTENTS,
    );
    expect(dir).toBe('upRight');
    expect(dir).not.toBe('right');
  });
});

// Minimal DOM stand-ins so we can drive attachSwipe without a real browser. We
// record listeners by type and fire synthetic touch events at them.
function fakeTarget() {
  const listeners = new Map<string, (e: TouchEvent) => void>();
  return {
    addEventListener: (type: string, l: EventListener) => {
      listeners.set(type, l as (e: TouchEvent) => void);
    },
    removeEventListener: (type: string) => {
      listeners.delete(type);
    },
    fire: (type: string, e: Partial<TouchEvent>) =>
      listeners.get(type)?.({ preventDefault: () => {}, ...e } as TouchEvent),
    get attachedTypes() {
      return [...listeners.keys()];
    },
  };
}

/** Build a TouchList-like object from touches, matching the DOM item()/length API. */
function touchList(...touches: Array<{ identifier: number; clientX: number; clientY: number }>) {
  const list: Record<string | number, unknown> = {
    length: touches.length,
    item: (i: number) => touches[i] ?? null,
  };
  touches.forEach((t, i) => (list[i] = t)); // index access, e.g. changedTouches[0]
  return list as unknown as TouchList;
}

describe('attachSwipe', () => {
  it('emits one move per swipe gesture in the dominant direction', () => {
    const target = fakeTarget();
    const onMove = vi.fn();
    const onTap = vi.fn();
    attachSwipe(target as unknown as HTMLElement, { onMove, onTap });

    const touch = { identifier: 1, clientX: 10, clientY: 10 };
    target.fire('touchstart', { changedTouches: touchList(touch) });
    target.fire('touchend', {
      changedTouches: touchList({ ...touch, clientX: 10 + DEFAULT_SWIPE_THRESHOLD + 5 }),
    });

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith('right');
    expect(onTap).not.toHaveBeenCalled();
  });

  it('treats a sub-threshold gesture as a tap, not a move', () => {
    const target = fakeTarget();
    const onMove = vi.fn();
    const onTap = vi.fn();
    attachSwipe(target as unknown as HTMLElement, { onMove, onTap });

    const touch = { identifier: 7, clientX: 50, clientY: 50 };
    target.fire('touchstart', { changedTouches: touchList(touch) });
    target.fire('touchend', { changedTouches: touchList({ ...touch, clientX: 52, clientY: 51 }) });

    expect(onTap).toHaveBeenCalledTimes(1);
    // The tap carries its end coordinates so the app can hit-test it (tap-to-move).
    expect(onTap).toHaveBeenCalledWith({ x: 52, y: 51 });
    expect(onMove).not.toHaveBeenCalled();
  });

  it('classifies a gesture against the geometry-supplied intent set', () => {
    const target = fakeTarget();
    const onMove = vi.fn();
    // A hex intent set (no left/right): a mostly-rightward swipe must resolve to a
    // hex diagonal, proving attachSwipe forwards the per-gesture intents.
    attachSwipe(
      target as unknown as HTMLElement,
      { onMove, onTap: vi.fn() },
      { intents: () => HEX_INTENTS },
    );

    const touch = { identifier: 4, clientX: 0, clientY: 0 };
    target.fire('touchstart', { changedTouches: touchList(touch) });
    target.fire('touchend', {
      changedTouches: touchList({ ...touch, clientX: 2 * DEFAULT_SWIPE_THRESHOLD, clientY: -20 }),
    });

    expect(onMove).toHaveBeenCalledWith('upRight');
  });

  it('follows only the first finger, so a second touch does not start a new gesture', () => {
    const target = fakeTarget();
    const onMove = vi.fn();
    attachSwipe(target as unknown as HTMLElement, { onMove, onTap: vi.fn() });

    const first = { identifier: 1, clientX: 0, clientY: 0 };
    target.fire('touchstart', { changedTouches: touchList(first) });
    // A second finger lands mid-gesture — must be ignored.
    target.fire('touchstart', {
      changedTouches: touchList({ identifier: 2, clientX: 200, clientY: 0 }),
    });
    target.fire('touchend', {
      changedTouches: touchList({ ...first, clientX: DEFAULT_SWIPE_THRESHOLD + 5 }),
    });

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith('right');
  });

  it('prevents page scroll while a tracked finger is moving', () => {
    const target = fakeTarget();
    attachSwipe(target as unknown as HTMLElement, { onMove: vi.fn(), onTap: vi.fn() });

    const touch = { identifier: 3, clientX: 0, clientY: 0 };
    target.fire('touchstart', { changedTouches: touchList(touch) });

    const preventDefault = vi.fn();
    target.fire('touchmove', {
      touches: touchList({ ...touch, clientY: 20 }),
      preventDefault,
    });
    expect(preventDefault).toHaveBeenCalled();
  });

  it('detaches every listener cleanly', () => {
    const target = fakeTarget();
    const detach = attachSwipe(target as unknown as HTMLElement, {
      onMove: vi.fn(),
      onTap: vi.fn(),
    });
    expect(target.attachedTypes).toContain('touchstart');
    detach();
    expect(target.attachedTypes).toHaveLength(0);
  });
});
