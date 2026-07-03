// App controller (M2 render/input glue; M4 scoring & timing; M5 seed sharing).
// Holds a GameSession (state + wall-clock timer + restart/next flow) and drives the
// canvas renderer and input from it. All rules and timing live in the session; this
// file wires model / rendering / input together, runs the frame loop, and owns the
// M5 meta layer: it keeps the URL hash in sync with the current level's seed, loads
// shared/pasted codes, and persists best times. The URL is rewritten whenever a
// level's identity is established — on boot and on each next-level draw — so it is
// always current to what the player sees.

import { attachKeyboard } from '../input/keyboard.ts';
import { attachSwipe } from '../input/swipe.ts';
import { formatTime, systemClock, type Clock } from '../model/index.ts';
import { CanvasRenderer, type RenderHud, type RendererOptions } from '../render/canvasRenderer.ts';
import { gardenTheme, type Theme } from '../render/theme.ts';
import { createControls } from './controls.ts';
import { levelFromCode, type CodedLevel } from './defaultLevel.ts';
import { syncLevelHash, type HistoryLike } from './levelUrl.ts';
import { GameSession } from './session.ts';
import { browserStore, type LevelStore } from './storage.ts';

export interface GameAppOptions {
  readonly theme?: Theme;
  readonly renderer?: RendererOptions;
  /** Time source for scoring; defaults to the real system clock. Injected in tests. */
  readonly clock?: Clock;
  /** Produce the next coded level after a win. Omitted → "next" replays the same level. */
  readonly nextLevel?: () => CodedLevel;
  /** History used to sync the URL hash; defaults to window.history. Injected in tests. */
  readonly history?: HistoryLike;
  /** Persistence for best times / seed history; defaults to localStorage-backed. */
  readonly store?: LevelStore;
}

export interface GameApp {
  readonly canvas: HTMLCanvasElement;
  /** Current game status, for tests and external UI. */
  status(): GameSession['status'];
  /** Tear down DOM listeners and the frame loop. */
  destroy(): void;
}

/** State the status line needs beyond the session: the current level's best time. */
interface WinInfo {
  readonly bestMs: number | undefined;
  readonly newBest: boolean;
}

/** Human-readable status line shown under the board (mirrors the on-board HUD). */
function statusText(session: GameSession, win: WinInfo): string {
  const time = formatTime(session.elapsedMs());
  switch (session.status) {
    case 'won': {
      const best = win.newBest
        ? ' New best!'
        : win.bestMs !== undefined
          ? ` (best ${formatTime(win.bestMs)})`
          : '';
      return `You won in ${time}!${best} Press N or tap for the next lawn — R to replay this one.`;
    }
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
 * Build the playable game inside `container`: a canvas board, a status line, and the
 * M5 seed-sharing controls. `container.dataset.status` mirrors the game status
 * ('playing'|'won'|'lost') so end-to-end tests can assert outcomes without reading
 * canvas pixels.
 */
export function mountGame(
  container: HTMLElement,
  initial: CodedLevel,
  options: GameAppOptions = {},
): GameApp {
  const theme = options.theme ?? gardenTheme;
  const clock = options.clock ?? systemClock;
  const store = options.store ?? browserStore();
  const history = options.history ?? (typeof window !== 'undefined' ? window.history : undefined);

  const canvas = document.createElement('canvas');
  canvas.className = 'board';
  container.appendChild(canvas);

  const statusEl = document.createElement('p');
  statusEl.className = 'status';
  container.appendChild(statusEl);

  // The code of the level currently loaded, or undefined for an un-shareable level
  // (the demo-map fallback). Updated whenever a new level's identity is established.
  let currentCode = initial.code;
  // Per-run win bookkeeping, reset whenever a fresh run begins.
  let win: WinInfo = { bestMs: undefined, newBest: false };
  let winHandled = false;

  const controls = createControls({
    onLoadCode: (code) => loadCode(code),
    shareUrl: () => (typeof location !== 'undefined' ? location.href : ''),
  });
  container.appendChild(controls.element);

  // The app owns the level-to-level flow (see replaySame / loadNextLawn below) so
  // the URL/code bookkeeping happens in one place; the session just plays whatever
  // level it is handed.
  const session = new GameSession(initial.level, { clock });

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
    statusEl.textContent = statusText(session, win);
    container.dataset.status = session.status;
  };

  /** Sync the URL hash to the current code and remember it in the seed history. */
  const announceLevel = (): void => {
    if (currentCode === undefined) return;
    if (history) syncLevelHash(history, currentCode);
    store.pushSeed(currentCode);
  };

  /** Reset per-run win state and refresh the best-time readout for the current level. */
  const beginRun = (): void => {
    winHandled = false;
    const bestMs = currentCode !== undefined ? store.bestTimeMs(currentCode) : undefined;
    win = { bestMs, newBest: false };
    controls.setBestTime(bestMs);
    controls.setCode(currentCode);
  };

  /** Record a just-won run's time against the current level (once per run). */
  const recordWin = (): void => {
    if (winHandled || session.status !== 'won' || currentCode === undefined) return;
    winHandled = true;
    const newBest = store.recordTime(currentCode, session.elapsedMs());
    win = { bestMs: store.bestTimeMs(currentCode), newBest };
    controls.setBestTime(win.bestMs);
  };

  /** Load a shared/pasted level code into the current session and sync the URL. */
  function loadCode(code: string): void {
    const coded = levelFromCode(code);
    currentCode = coded.code;
    session.load(coded.level);
    announceLevel();
    beginRun();
    draw();
  }

  /** Replay the current lawn from scratch (R, or retry after a loss). */
  const replaySame = (): void => {
    session.restart();
    beginRun();
    draw();
  };

  /**
   * Move on to a fresh lawn: draw the next level from the source and sync the URL.
   * Used for "next" after a win and for skipping a lawn mid-play. With no source
   * configured this falls back to replaying the current lawn.
   */
  const loadNextLawn = (): void => {
    if (!options.nextLevel) {
      replaySame();
      return;
    }
    const coded = options.nextLevel();
    currentCode = coded.code;
    session.load(coded.level);
    announceLevel();
    beginRun();
    draw();
  };

  const doMove = (input: Parameters<GameSession['move']>[0]): void => {
    if (session.status !== 'playing') return;
    session.move(input);
    recordWin();
    draw();
  };

  const detachKeyboard = attachKeyboard(window, {
    onMove: doMove,
    // R always replays the current lawn.
    onRestart: replaySame,
    // N / Enter / Space: after a loss, retry the same lawn; otherwise (skipping
    // mid-play, or continuing after a win) move on to a fresh lawn.
    onAdvance: () => {
      if (session.status === 'lost') replaySame();
      else loadNextLawn();
    },
  });
  // Swipes on the board mirror arrow keys; a tap only acts on a *finished* lawn, so
  // a stray tap mid-run can't wipe out progress: retry after a loss, next after a win.
  const detachSwipe = attachSwipe(canvas, {
    onMove: doMove,
    onTap: () => {
      if (session.status === 'lost') replaySame();
      else if (session.status === 'won') loadNextLawn();
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

  // Boot: advertise the starting level in the URL/history and draw the first frame.
  announceLevel();
  beginRun();
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
