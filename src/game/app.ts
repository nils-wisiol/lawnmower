// App controller (M2 render/input glue, extended in M4 with scoring & timing).
// Holds a GameSession (state + wall-clock timer + restart/next flow) and drives
// the canvas renderer and input from it. All rules and timing live in the session;
// this file only wires model / rendering / input together and runs the frame loop.

import { attachKeyboard } from '../input/keyboard.ts';
import { attachSwipe } from '../input/swipe.ts';
import { formatTime, systemClock, type Clock, type Level } from '../model/index.ts';
import { CanvasRenderer, type RenderHud, type RendererOptions } from '../render/canvasRenderer.ts';
import { gardenTheme, type Theme } from '../render/theme.ts';
import { GameSession } from './session.ts';

export interface GameAppOptions {
  readonly theme?: Theme;
  readonly renderer?: RendererOptions;
  /** Time source for scoring; defaults to the real system clock. Injected in tests. */
  readonly clock?: Clock;
  /** Produce the level to play after a win. Omitted → "next" replays the same level. */
  readonly nextLevel?: () => Level;
}

export interface GameApp {
  readonly canvas: HTMLCanvasElement;
  /** Current game status, for tests and external UI. */
  status(): GameSession['status'];
  /** Tear down DOM listeners and the frame loop. */
  destroy(): void;
}

/** Human-readable status line shown under the board (mirrors the on-board HUD). */
function statusText(session: GameSession): string {
  const time = formatTime(session.elapsedMs());
  switch (session.status) {
    case 'won':
      return `You won in ${time}! Press N or tap for the next lawn — R to replay this one.`;
    case 'lost':
      return session.failReason === 'timeout'
        ? `Time's up! Press R or tap to retry.`
        : `You re-mowed a tile — crash! Press R or tap to retry.`;
    default: {
      const limit = session.timeLimitMs();
      const clock = limit === undefined ? time : `${time} / ${formatTime(limit)}`;
      return `Mowed ${session.state.mowed.size} / ${session.state.totalMowable} · ${clock}`;
    }
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
  const clock = options.clock ?? systemClock;

  const canvas = document.createElement('canvas');
  canvas.className = 'board';
  container.appendChild(canvas);

  const statusEl = document.createElement('p');
  statusEl.className = 'status';
  container.appendChild(statusEl);

  const session = new GameSession(level, { clock, nextLevel: options.nextLevel });

  // The renderer sizes the canvas to a specific level on construction, so a
  // next-level jump (which may change grid dimensions) rebuilds it.
  let renderer = new CanvasRenderer(canvas, theme, session.level, options.renderer);
  let renderedLevel = session.level;

  const hud = (): RenderHud => ({
    elapsedMs: session.elapsedMs(),
    timeLimitMs: session.timeLimitMs(),
    remainingMs: session.remainingMs(),
    failReason: session.failReason,
  });

  const draw = (): void => {
    if (session.level !== renderedLevel) {
      renderer = new CanvasRenderer(canvas, theme, session.level, options.renderer);
      renderedLevel = session.level;
    }
    renderer.render(session.state, hud());
    statusEl.textContent = statusText(session);
    container.dataset.status = session.status;
  };

  const doMove = (input: Parameters<GameSession['move']>[0]): void => {
    if (session.status !== 'playing') return;
    session.move(input);
    draw();
  };

  const detachKeyboard = attachKeyboard(window, {
    onMove: doMove,
    // R always retries the current level; Enter/Space/N continue (next after a win).
    onRestart: () => {
      session.restart();
      draw();
    },
    onAdvance: () => {
      session.advance();
      draw();
    },
  });
  // Swipes on the board mirror arrow keys; a tap continues, but only from a
  // finished level so a stray tap mid-run can't wipe out progress.
  const detachSwipe = attachSwipe(canvas, {
    onMove: doMove,
    onTap: () => {
      if (session.status !== 'playing') {
        session.advance();
        draw();
      }
    },
  });

  // Frame loop: keep the on-board clock live and enforce the time-limit fail even
  // with no input (the timer never pauses — §2). Guarded so importing the app in a
  // non-DOM/test environment (no requestAnimationFrame) is inert; timing there is
  // driven synchronously through session.move/tick instead.
  const hasRaf = typeof requestAnimationFrame === 'function';
  let frame = 0;
  const tick = (): void => {
    // Only playing runs change over time; when playing, tick may time us out, and
    // the redraw then shows either the live clock or the just-triggered end screen.
    if (session.status === 'playing') {
      session.tick();
      draw();
    }
    frame = requestAnimationFrame(tick);
  };
  if (hasRaf) frame = requestAnimationFrame(tick);

  draw();

  return {
    canvas,
    status: () => session.status,
    destroy: () => {
      detachKeyboard();
      detachSwipe();
      if (hasRaf) cancelAnimationFrame(frame);
    },
  };
}
