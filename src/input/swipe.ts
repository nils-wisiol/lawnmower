// Touch swipe input pipeline (lawnmower.md §2/§5). Produces one abstract
// InputDirection per swipe gesture, mapped by the Topology onto a concrete
// Direction — so this layer stays geometry-agnostic, exactly like keyboard.ts.
// A swipe is one discrete input (one move per gesture, §5): the direction is
// decided once at touchend from the net start→end displacement, not streamed as
// the finger moves. A short tap (below the swipe threshold) is treated as the
// touch equivalent of the restart key, for instant retry from a win/fail state.

import type { InputDirection } from '../model/index.ts';

/** Minimum net finger travel (in CSS px) for a gesture to count as a swipe, not a tap. */
export const DEFAULT_SWIPE_THRESHOLD = 24;

/**
 * Classify a swipe from its net displacement (dx right-positive, dy down-positive,
 * screen coords). Returns the dominant-axis direction, or undefined if the travel
 * is below `threshold` (a tap, not a swipe). Ties on a perfect diagonal resolve to
 * the horizontal axis — arbitrary but deterministic.
 */
export function swipeDirection(
  dx: number,
  dy: number,
  threshold = DEFAULT_SWIPE_THRESHOLD,
): InputDirection | undefined {
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return undefined;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'down' : 'up';
}

export interface SwipeHandlers {
  onMove(input: InputDirection): void;
  /** Fired on a tap (sub-threshold gesture) — the touch analogue of the restart key. */
  onTap(): void;
}

export interface SwipeOptions {
  /** Override the swipe/tap distance threshold (CSS px). */
  readonly threshold?: number;
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

    const direction = swipeDirection(touch.clientX - startX, touch.clientY - startY, threshold);
    trackingId = undefined;

    if (direction !== undefined) {
      event.preventDefault();
      handlers.onMove(direction);
    } else {
      handlers.onTap();
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
