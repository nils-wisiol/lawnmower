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
import {
  formatTime,
  systemClock,
  type CellId,
  type Clock,
  type Facing,
  type InputDirection,
  type Level,
  type MoveOutcome,
  type Topology,
} from '../model/index.ts';
import {
  CanvasRenderer,
  type RenderAnim,
  type RenderHud,
  type RendererOptions,
} from '../render/canvasRenderer.ts';
import { gardenTheme, type Theme } from '../render/theme.ts';
import { createControls } from './controls.ts';
import { levelFromCode, type CodedLevel } from './defaultLevel.ts';
import { pushLevelHash, readLevelCode, syncLevelHash, type HistoryLike } from './levelUrl.ts';
import { GameSession } from './session.ts';
import { browserStore, type LevelStore } from './storage.ts';
import type { CoachConfig } from './tutorial.ts';

/** Breathing room (CSS px) kept between the board and the viewport edges. */
const BOARD_MARGIN = 16;

// Juice timings (M6). The mower slides between cells and a just-mown tile pops; the
// pop lingers a touch past the slide. Both are visual only — the model is instant —
// and both collapse to 0 (snap) under prefers-reduced-motion (§4 accessibility).
const SLIDE_MS = 90;
const POP_MS = 200;

/** Every abstract movement intent, in the order the swipe classifier prefers on ties. */
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

/**
 * The movement intents a topology actually maps — what the 6-sector swipe classifier
 * buckets a gesture into (hexagonal.md §2.2). Square yields the four cardinals; a
 * flat-top hex yields the vertical pair plus the four diagonals.
 */
function supportedInputs(topology: Topology): InputDirection[] {
  return ALL_INPUTS.filter((input) => topology.directionForInput(input) !== undefined);
}

/**
 * The mower's cardinal facing for a step, derived from its screen-space layout delta
 * (hexagonal.md §2.6). Works for every modality — key, swipe, and tap-to-move (which
 * has no input intent at all) — and every geometry, since it reads only the from→to
 * vector. Diagonals round to the nearest cardinal until H3 gives the mower 6 headings.
 */
function facingForStep(topology: Topology, from: CellId, to: CellId): Facing {
  const a = topology.layout(from);
  const b = topology.layout(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'down' : 'up';
}

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
  /** Onboarding coach shown while its `code` is the loaded level (M6). */
  readonly coach?: CoachConfig;
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
    // On-screen equivalent of the N key: hand out a fresh lawn.
    onNext: () => loadNextLawn(),
    shareUrl: () => (typeof location !== 'undefined' ? location.href : ''),
  });
  container.appendChild(controls.element);

  // Onboarding coach (M6): a small card shown only while its configured level (the
  // tutorial) is the one loaded, so it teaches on the first lawn and disappears once
  // the player moves on to generated lawns. Sits above the seed controls.
  const coachEl = options.coach ? document.createElement('div') : undefined;
  if (coachEl) {
    coachEl.className = 'coach';
    container.insertBefore(coachEl, controls.element);
  }

  // The app owns the level-to-level flow (see replaySame / loadNextLawn below) so
  // the URL/code bookkeeping happens in one place; the session just plays whatever
  // level it is handed.
  const session = new GameSession(initial.level, { clock });

  // Facing + in-flight animation for the M6 juice, tracked here (never in the model,
  // which stays instant). `facing` persists between moves so the idle mower keeps its
  // last heading; `anim` is the current slide/pop, retired by the frame loop.
  let facing: Facing = 'right';
  let anim:
    { from: string; to: string; facing: Facing; popCell?: string; start: number } | undefined;
  const reducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  const slideMs = reducedMotion ? 0 : SLIDE_MS;
  const popMs = reducedMotion ? 0 : POP_MS;
  const animMs = Math.max(slideMs, popMs);
  const animNow = (): number =>
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

  // The board never grows wider than the viewport (minus a small margin) so it
  // fits narrow phone screens; an explicit maxWidth in options.renderer (tests)
  // still wins. Undefined outside a DOM environment.
  const boardMaxWidth = (): number | undefined => {
    if (typeof window === 'undefined') return undefined;
    const w = window.innerWidth || document.documentElement.clientWidth;
    return w > 0 ? Math.max(1, w - BOARD_MARGIN) : undefined;
  };
  const makeRenderer = (level: Level): CanvasRenderer =>
    new CanvasRenderer(canvas, theme, level, { maxWidth: boardMaxWidth(), ...options.renderer });

  // The renderer sizes the canvas to a specific level on construction, so a
  // next-level jump (which may change grid dimensions) rebuilds it.
  let renderer = makeRenderer(session.level);
  let renderedLevel = session.level;

  const hud = (): RenderHud => ({
    elapsedMs: session.elapsedMs(),
    timeLimitMs: session.timeLimitMs(),
    remainingMs: session.remainingMs(),
    failReason: session.failReason,
  });

  /** The current frame's visual animation: mower slide + fresh-mow pop, or just facing. */
  const renderAnim = (): RenderAnim => {
    if (anim === undefined) return { facing };
    const elapsed = animNow() - anim.start;
    const slideT = slideMs <= 0 ? 1 : Math.min(1, elapsed / slideMs);
    const popT = popMs <= 0 ? 1 : Math.min(1, elapsed / popMs);
    return {
      facing,
      mower:
        slideT < 1
          ? { from: anim.from, to: anim.to, t: easeOut(slideT), facing: anim.facing }
          : undefined,
      pop: anim.popCell !== undefined && popT < 1 ? { cell: anim.popCell, t: popT } : undefined,
    };
  };

  /** Show/refresh the onboarding coach, but only while its level is the one loaded. */
  const updateCoach = (): void => {
    const coach = options.coach;
    if (coachEl === undefined || coach === undefined) return;
    const show = currentCode === coach.code;
    coachEl.hidden = !show;
    if (!show) return;
    coachEl.textContent =
      session.status === 'won'
        ? coach.messages.won
        : session.status === 'lost'
          ? coach.messages.lost
          : session.state.mowed.size <= 1
            ? coach.messages.start
            : coach.messages.progress;
  };

  const draw = (): void => {
    if (session.level !== renderedLevel) {
      renderer = makeRenderer(session.level);
      renderedLevel = session.level;
    }
    renderer.render(session.state, hud(), renderAnim());
    statusEl.textContent = statusText(session, win);
    updateCoach();
    container.dataset.status = session.status;
  };

  /**
   * Sync the URL hash to the current code and remember it in the seed history.
   * `push` adds a back-button entry (moving to a new level); otherwise the current
   * entry is rewritten in place (boot / normalising).
   */
  const announceLevel = (push: boolean): void => {
    if (currentCode === undefined) return;
    if (history) {
      if (push) pushLevelHash(history, currentCode);
      else syncLevelHash(history, currentCode);
    }
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
    announceLevel(true);
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
    announceLevel(true);
    beginRun();
    draw();
  };

  // Back/Forward: the browser has already moved the URL to a level we previously
  // pushed, so load whatever level the hash now names into the session — a fresh
  // run of that lawn. No history write here, or we'd fight the navigation we're
  // handling. Ignored when the hash is bare or already the level on screen.
  const onPopState = (): void => {
    const code = readLevelCode(typeof location !== 'undefined' ? location.hash : '');
    if (code === undefined || code === currentCode) return;
    const coded = levelFromCode(code);
    currentCode = coded.code;
    session.load(coded.level);
    if (currentCode !== undefined) store.pushSeed(currentCode);
    beginRun();
    draw();
  };

  // Commit the visual side of a move the session already applied: set the mower's
  // facing from where it actually went and, for a non-blocked outcome, start the
  // slide (a crash still slides into the fatal cell); pop the destination only when
  // this move freshly cut a tile. Shared by key/swipe moves and tap-to-move so every
  // modality animates identically.
  const applyMoveVisuals = (from: CellId, mowedBefore: number, outcome: MoveOutcome): void => {
    if (outcome !== 'blocked') {
      const to = session.state.position;
      const stepFacing = facingForStep(session.level.topology, from, to);
      facing = stepFacing;
      const freshlyMown = session.state.mowed.size > mowedBefore;
      anim = {
        from,
        to,
        facing: stepFacing,
        popCell: freshlyMown ? to : undefined,
        start: animNow(),
      };
    }
    recordWin();
    draw();
  };

  const doMove = (input: InputDirection): void => {
    if (session.status !== 'playing') return;
    const from = session.state.position;
    const mowedBefore = session.state.mowed.size;
    applyMoveVisuals(from, mowedBefore, session.move(input));
  };

  // Tap/click-to-move (hexagonal.md §2.6): step straight onto `target`. The session's
  // moveTo no-ops (blocked) unless `target` is a current neighbour, so a tap that
  // resolves to a non-neighbour or the current cell changes nothing.
  const doMoveTo = (target: CellId): void => {
    if (session.status !== 'playing') return;
    const from = session.state.position;
    const mowedBefore = session.state.mowed.size;
    applyMoveVisuals(from, mowedBefore, session.moveTo(target));
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
  // A click (desktop) or tap (touch) resolves to a board cell. While playing it is a
  // one-step move onto a legal neighbour; a click/tap on the current cell or a
  // non-neighbour hit-tests to a `blocked` moveTo — a no-op, so a stray tap still
  // can't wipe out progress (hexagonal.md §2.6). On a *finished* lawn it falls back to
  // the pre-tap behaviour: retry after a loss, next after a win.
  const onPointer = (clientX: number, clientY: number): void => {
    if (session.status === 'playing') {
      const rect = canvas.getBoundingClientRect();
      const target = renderer.cellAtPixel(clientX - rect.left, clientY - rect.top);
      if (target !== undefined) doMoveTo(target);
      return;
    }
    if (session.status === 'lost') replaySame();
    else if (session.status === 'won') loadNextLawn();
  };

  // Swipes on the board mirror arrow keys; the swipe classifier buckets a gesture into
  // whichever intents the current geometry accepts (4 quadrants for square, 6 sectors
  // for hex), re-read per gesture so a level change takes effect without re-attaching.
  const detachSwipe = attachSwipe(
    canvas,
    { onMove: doMove, onTap: (point) => onPointer(point.x, point.y) },
    { intents: () => supportedInputs(session.level.topology) },
  );
  // Desktop click-to-move: the mouse analogue of tap, same hit-test and policy.
  const onClick = (event: MouseEvent): void => onPointer(event.clientX, event.clientY);
  canvas.addEventListener('click', onClick);

  // Frame loop: keep the on-board clock live and enforce the time-limit fail even
  // with no input (the timer never pauses — §2). Guarded so importing the app in a
  // non-DOM/test environment (no requestAnimationFrame) is inert; timing there is
  // driven synchronously through session.move/tick instead.
  // Refit the board when the viewport changes (rotation, window resize) so it keeps
  // fitting the screen width — rebuild the renderer at the new size and redraw.
  const onResize = (): void => {
    renderer = makeRenderer(session.level);
    renderedLevel = session.level;
    draw();
  };
  const hasWindow = typeof window !== 'undefined';
  if (hasWindow) {
    window.addEventListener('resize', onResize);
    window.addEventListener('popstate', onPopState);
  }

  const hasRaf = typeof requestAnimationFrame === 'function';
  let frame = 0;
  const tick = (): void => {
    // Retire a finished animation, forcing one last frame so the mower settles on
    // its cell even after a win/loss (when the clock loop below is paused).
    let settled = false;
    if (anim !== undefined && animNow() - anim.start >= animMs) {
      anim = undefined;
      settled = true;
    }
    // Only playing runs change over time; when playing, tick may time us out, and
    // the redraw then shows either the live clock or the just-triggered end screen.
    // When not playing, redraw only while an animation is still running (or settling).
    if (session.status === 'playing') {
      session.tick();
      draw();
    } else if (anim !== undefined || settled) {
      draw();
    }
    frame = requestAnimationFrame(tick);
  };
  if (hasRaf) frame = requestAnimationFrame(tick);

  // Boot: normalise the URL to the starting level (replace, not push, so Back from
  // the first lawn leaves the app) and draw the first frame.
  announceLevel(false);
  beginRun();
  draw();

  return {
    canvas,
    status: () => session.status,
    destroy: () => {
      detachKeyboard();
      detachSwipe();
      canvas.removeEventListener('click', onClick);
      if (hasWindow) {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('popstate', onPopState);
      }
      if (hasRaf) cancelAnimationFrame(frame);
    },
  };
}
