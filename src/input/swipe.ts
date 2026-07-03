// Touch swipe input pipeline (lawnmower.md §2/§5). Produces one abstract
// InputDirection per swipe gesture, mapped by the Topology onto a concrete
// Direction — so this layer stays geometry-agnostic, exactly like keyboard.ts.
// A swipe is one discrete input (one move per gesture, §5): the direction is
// decided once at touchend from the net start→end displacement, not streamed as
// the finger moves. A short tap (below the swipe threshold) carries its coordinates
// so the app can hit-test it (tap-to-move, or restart/next on a finished lawn).

import type { InputDirection } from '../model/index.ts';

/** Minimum net finger travel (in CSS px) for a gesture to count as a swipe, not a tap. */
export const DEFAULT_SWIPE_THRESHOLD = 24;

/**
 * Canonical unit vector (screen coords: x right-positive, y down-positive) for each
 * movement intent — the direction a swipe "meaning" that intent points. The four
 * cardinals sit on the axes; the diagonals sit at the flat-top hex headings (±30°
 * from horizontal, hexagonal.md §2.1), which is why they land as clean 60° sectors.
 * A gesture is classified by picking the allowed intent this vector best aligns with.
 */
const HALF = 0.5;
const SIN60 = Math.sqrt(3) / 2;
const INTENT_VECTOR: Record<InputDirection, { x: number; y: number }> = {
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  upRight: { x: SIN60, y: -HALF },
  downRight: { x: SIN60, y: HALF },
  upLeft: { x: -SIN60, y: -HALF },
  downLeft: { x: -SIN60, y: HALF },
};

/**
 * The default intent set: the four square quadrants. Ordered so a perfect-diagonal
 * gesture resolves to the horizontal axis (a listed-earlier intent wins a tie),
 * preserving the pre-hex behaviour. A hex board passes its own six-intent set.
 */
export const SQUARE_SWIPE_INTENTS: readonly InputDirection[] = ['right', 'left', 'up', 'down'];

/**
 * Classify a swipe from its net displacement (dx right-positive, dy down-positive,
 * screen coords) into one of `intents`, or undefined if the travel is below
 * `threshold` (a tap, not a swipe). The chosen intent is the one whose canonical
 * vector best aligns with the gesture (max dot product); ties resolve to whichever
 * intent appears first in `intents` — for the default square set that is the
 * horizontal axis, matching the old dominant-axis rule. Passing the six hex intents
 * turns this into a 6×60° sector classifier with no other change (hexagonal.md §2.2).
 */
export function swipeDirection(
  dx: number,
  dy: number,
  threshold = DEFAULT_SWIPE_THRESHOLD,
  intents: readonly InputDirection[] = SQUARE_SWIPE_INTENTS,
): InputDirection | undefined {
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return undefined;
  let best: InputDirection | undefined;
  let bestDot = -Infinity;
  for (const intent of intents) {
    const v = INTENT_VECTOR[intent];
    const dot = dx * v.x + dy * v.y;
    if (dot > bestDot) {
      bestDot = dot;
      best = intent;
    }
  }
  return best;
}

/** A tap's location, in CSS pixels relative to the viewport (event client coords). */
export interface TapPoint {
  readonly x: number;
  readonly y: number;
}

export interface SwipeHandlers {
  onMove(input: InputDirection): void;
  /**
   * Fired on a tap (sub-threshold gesture), carrying the tap point so the app can
   * hit-test it: tap-to-move onto a neighbour while playing, or restart/next on a
   * finished lawn (hexagonal.md §2.6).
   */
  onTap(point: TapPoint): void;
}

export interface SwipeOptions {
  /** Override the swipe/tap distance threshold (CSS px). */
  readonly threshold?: number;
  /**
   * The movement intents this board accepts, re-read per gesture so a geometry
   * change (e.g. loading a hex level) takes effect without re-attaching. Defaults to
   * the four square quadrants.
   */
  readonly intents?: () => readonly InputDirection[];
}

/**
 * Wire touch events on `target` to move/tap handlers. Returns a detach function.
 * We track only the first (primary) touch of a gesture and decide its direction at
 * touchend, so a multi-finger or wandering gesture still yields exactly one move.
 * touchmove is preventDefault-ed while a gesture is active so the page doesn't
 * scroll under the player's thumb.
 */
export function attachSwipe(
  target: Window | HTMLElement,
  handlers: SwipeHandlers,
  options: SwipeOptions = {},
): () => void {
  const threshold = options.threshold ?? DEFAULT_SWIPE_THRESHOLD;
  const intents = options.intents;

  let startX = 0;
  let startY = 0;
  let trackingId: number | undefined;

  const onStart = (event: TouchEvent): void => {
    if (trackingId !== undefined) return; // already following a gesture
    const touch = event.changedTouches[0];
    if (touch === undefined) return;
    trackingId = touch.identifier;
    startX = touch.clientX;
    startY = touch.clientY;
  };

  const trackedTouch = (list: TouchList): Touch | undefined => {
    for (let i = 0; i < list.length; i++) {
      const t = list.item(i);
      if (t !== null && t.identifier === trackingId) return t;
    }
    return undefined;
  };

  const onMove = (event: TouchEvent): void => {
    if (trackingId === undefined) return;
    // Keep the page from scrolling while the player is mid-swipe.
    if (trackedTouch(event.touches) !== undefined) event.preventDefault();
  };

  const onEnd = (event: TouchEvent): void => {
    if (trackingId === undefined) return;
    const touch = trackedTouch(event.changedTouches);
    if (touch === undefined) return; // a different finger lifted; keep waiting

    const direction = swipeDirection(
      touch.clientX - startX,
      touch.clientY - startY,
      threshold,
      intents?.(),
    );
    trackingId = undefined;

    // Consume the gesture either way: a swipe must not scroll, and a tap must not
    // emit a ghost mouse click that would fire the desktop pointer handler twice.
    event.preventDefault();
    if (direction !== undefined) {
      handlers.onMove(direction);
    } else {
      handlers.onTap({ x: touch.clientX, y: touch.clientY });
    }
  };

  const onCancel = (): void => {
    trackingId = undefined;
  };

  target.addEventListener('touchstart', onStart as EventListener, { passive: true });
  target.addEventListener('touchmove', onMove as EventListener, { passive: false });
  target.addEventListener('touchend', onEnd as EventListener);
  target.addEventListener('touchcancel', onCancel as EventListener);

  return () => {
    target.removeEventListener('touchstart', onStart as EventListener);
    target.removeEventListener('touchmove', onMove as EventListener);
    target.removeEventListener('touchend', onEnd as EventListener);
    target.removeEventListener('touchcancel', onCancel as EventListener);
  };
}
