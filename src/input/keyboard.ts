// Keyboard input pipeline (lawnmower.md §5). Produces one abstract InputDirection
// per discrete key press; the Topology maps that onto a concrete Direction, so
// this layer stays geometry-agnostic (arrow keys work the same for a future hex
// board). No key-repeat: holding a key must NOT auto-advance — each move needs a
// distinct press (§5), enforced by dropping synthetic `repeat` events.

import type { InputDirection } from '../model/index.ts';

/** Map a KeyboardEvent.key to a movement intent, or undefined if it isn't one. */
export function inputForKey(key: string): InputDirection | undefined {
  switch (key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      return 'up';
    case 'ArrowDown':
    case 's':
    case 'S':
      return 'down';
    case 'ArrowLeft':
    case 'a':
    case 'A':
      return 'left';
    case 'ArrowRight':
    case 'd':
    case 'D':
      return 'right';
    default:
      return undefined;
  }
}

/** Keys that restart the *same* level (instant retry from any end state — §4). */
export function isRestartKey(key: string): boolean {
  return key === 'r' || key === 'R';
}

/**
 * Keys that continue past a finished run: the next level after a win, or a retry
 * after a loss (the app decides which). Enter/Space are the natural "continue"
 * keys; N is a mnemonic for "next".
 */
export function isAdvanceKey(key: string): boolean {
  return key === 'Enter' || key === ' ' || key === 'n' || key === 'N';
}

export interface KeyboardHandlers {
  onMove(input: InputDirection): void;
  onRestart(): void;
  /** Optional: continue past a finished run (next level / retry). */
  onAdvance?(): void;
}

/**
 * Wire keydown events to move/restart handlers. Returns a detach function.
 * `repeat` events (held key) are ignored so movement is strictly one-per-press.
 */
export function attachKeyboard(
  target: Window | HTMLElement,
  handlers: KeyboardHandlers,
): () => void {
  const listener = (event: KeyboardEvent): void => {
    if (event.repeat) return; // no key-repeat auto-advance

    const input = inputForKey(event.key);
    if (input !== undefined) {
      event.preventDefault(); // arrow keys otherwise scroll the page
      handlers.onMove(input);
      return;
    }
    if (isRestartKey(event.key)) {
      event.preventDefault();
      handlers.onRestart();
      return;
    }
    if (isAdvanceKey(event.key) && handlers.onAdvance) {
      event.preventDefault();
      handlers.onAdvance();
    }
  };

  target.addEventListener('keydown', listener as EventListener);
  return () => target.removeEventListener('keydown', listener as EventListener);
}
