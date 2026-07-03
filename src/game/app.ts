// M2 app controller: the thin glue that wires the pure model to the canvas
// renderer and keyboard input. Holds the single mutable `state` and re-renders on
// every change; all rules still live in the model. Model / rendering / input stay
// separately testable — this file just connects them.

import { attachKeyboard } from '../input/keyboard.ts';
import { attachSwipe } from '../input/swipe.ts';
import { createGame, move, type InputDirection, type Level } from '../model/index.ts';
import type { GameState } from '../model/index.ts';
import { CanvasRenderer, type RendererOptions } from '../render/canvasRenderer.ts';
import { gardenTheme, type Theme } from '../render/theme.ts';

export interface GameAppOptions {
  readonly theme?: Theme;
  readonly renderer?: RendererOptions;
}

export interface GameApp {
  readonly canvas: HTMLCanvasElement;
  /** Current game status, for tests and external UI. */
  status(): GameState['status'];
  /** Tear down DOM listeners. */
  destroy(): void;
}

/** Human-readable status line shown under the board. */
function statusText(state: GameState): string {
  switch (state.status) {
    case 'won':
      return `You won! Mowed all ${state.totalMowable} tiles. Press R or tap to play again.`;
    case 'lost':
      return 'You re-mowed a tile — crash! Press R or tap to retry.';
    default:
      return `Mowed ${state.mowed.size} / ${state.totalMowable}. Arrow keys or swipe to mow.`;
  }
}

/**
 * Build the playable game inside `container`: a canvas board plus a status line.
 * `container.dataset.status` mirrors the game status ('playing'|'won'|'lost') so
 * end-to-end tests can assert outcomes without reading canvas pixels.
 */
export function mountGame(
  container: HTMLElement,
  level: Level,
  options: GameAppOptions = {},
): GameApp {
  const theme = options.theme ?? gardenTheme;

  const canvas = document.createElement('canvas');
  canvas.className = 'board';
  container.appendChild(canvas);

  const statusEl = document.createElement('p');
  statusEl.className = 'status';
  container.appendChild(statusEl);

  const renderer = new CanvasRenderer(canvas, theme, level, options.renderer);

  let state = createGame(level);

  const draw = (): void => {
    renderer.render(state);
    statusEl.textContent = statusText(state);
    container.dataset.status = state.status;
  };

  const doMove = (input: InputDirection): void => {
    if (state.status !== 'playing') return;
    state = move(state, input).state;
    draw();
  };

  const restart = (): void => {
    state = createGame(level);
    draw();
  };

  const detachKeyboard = attachKeyboard(window, { onMove: doMove, onRestart: restart });
  // Swipes on the board mirror arrow keys; a tap restarts, but only from a
  // finished level so a stray tap mid-run can't wipe out progress.
  const detachSwipe = attachSwipe(canvas, {
    onMove: doMove,
    onTap: () => {
      if (state.status !== 'playing') restart();
    },
  });

  draw();

  return {
    canvas,
    status: () => state.status,
    destroy: () => {
      detachKeyboard();
      detachSwipe();
    },
  };
}
