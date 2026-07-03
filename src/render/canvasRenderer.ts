// Canvas 2D renderer (lawnmower.md §5). Draws a GameState by walking the abstract
// cell graph and asking the Topology where each cell lives — it never assumes a
// square grid, so a hex/teleport Topology renders through this same code. Every
// color comes from the injected Theme; there are no palette constants here.

import { formatTime, traitsOf, type CellId, type CellTraits, type Level } from '../model/index.ts';
import type { FailReason, GameState, InputDirection } from '../model/index.ts';
import { drawSprite, variantFor, type Sprite } from './sprite.ts';
import type { Theme } from './theme.ts';

export interface RendererOptions {
  /** Edge length of one cell in CSS pixels (the desired size before any fit shrink). */
  readonly cellSize?: number;
  /** Gap between cells (drawn as grid lines), in CSS pixels. */
  readonly gap?: number;
  /**
   * Maximum board width in CSS pixels. When set, cells shrink (never grow) so the
   * whole board fits within it — this is what keeps a wide lawn on-screen on a
   * narrow phone (lawnmower.md §3) instead of overflowing the viewport.
   */
  readonly maxWidth?: number;
}

/** Timing/scoring overlay data the board draws on top of the level (M4). */
export interface RenderHud {
  /** Wall-clock time on the mower's run, in ms (the score). */
  readonly elapsedMs: number;
  /** Level time limit in ms, if any; shown alongside the clock. */
  readonly timeLimitMs?: number;
  /** Time left before the limit fail, if timed; drives the danger tint. */
  readonly remainingMs?: number;
  /** On a loss, why — so the end screen can distinguish a crash from a timeout. */
  readonly failReason?: FailReason;
}

/**
 * Visual-only animation state for a frame (M6 juice). Produced by the app from its
 * move history and the clock; the model itself stays instant and pure. Absent →
 * the board draws statically (existing render tests pass an undefined `anim`).
 */
export interface RenderAnim {
  /**
   * The mower mid-slide between two cells. `t` in [0,1] eases 0→1 over the move;
   * `facing` selects the directional sprite. Absent while the mower is at rest.
   */
  readonly mower?: {
    readonly from: CellId;
    readonly to: CellId;
    readonly t: number;
    readonly facing: InputDirection;
  };
  /** A just-mown cell popping. `t` in [0,1] (0 = the instant it was cut, 1 = settled). */
  readonly pop?: { readonly cell: CellId; readonly t: number };
  /** The mower's current heading when at rest, so the idle sprite still faces right. */
  readonly facing?: InputDirection;
}

/** Below this much time left, the HUD clock turns to the danger colour. */
const DANGER_THRESHOLD_MS = 5000;

const DEFAULT_CELL_SIZE = 48;
const DEFAULT_GAP = 2;

/** Default mower heading before the first move (also the render-test fallback). */
const DEFAULT_FACING: InputDirection = 'right';

/**
 * Pick a cell edge length that keeps `cols` cells within `maxWidth` CSS pixels,
 * never upscaling past the desired size. With no `maxWidth` (or no cells) the
 * desired size is used unchanged. Exported as a pure function so the fit rule is
 * unit-testable without a canvas — it is what makes a wide board fit a phone.
 */
export function fitCellSize(
  cols: number,
  options: { readonly cellSize?: number; readonly maxWidth?: number } = {},
): number {
  const desired = options.cellSize ?? DEFAULT_CELL_SIZE;
  if (options.maxWidth === undefined || cols <= 0) return desired;
  const fit = Math.floor(options.maxWidth / cols);
  return Math.min(desired, Math.max(1, fit));
}

/**
 * Pick a cell's fill from its traits and mow state — the visual mirror of the
 * trait-based model (§5). A tile is coloured by *what it is*, not a tile enum, so
 * a new trait combination themes itself. Exported for unit testing without a canvas.
 */
export function cellFill(theme: Theme, traits: CellTraits, mowed: boolean): string {
  if (!traits.passable) return theme.obstacle;
  if (!traits.mowable) return theme.path;
  return mowed ? theme.grassMowed : theme.grassUnmowed;
}

/**
 * Pick a cell's pixel-art sprite from its traits and mow state — the sprite mirror
 * of `cellFill`, and of the trait-based model (§5): a cell is drawn by *what it is*,
 * not a tile enum, so a new trait combination sprites itself. Obstacle and unmowed-
 * grass variety is chosen deterministically per cell (`variantFor`), so a lawn looks
 * the same on every redraw. Returns undefined only if a variant list is empty (the
 * base `cellFill` colour then stands in). Exported for unit testing without a canvas.
 */
export function spriteForCell(
  theme: Theme,
  traits: CellTraits,
  mowed: boolean,
  cell: CellId,
): Sprite | undefined {
  if (!traits.passable) return variantFor(theme.sprites.obstacles, cell);
  if (!traits.mowable) return theme.sprites.path;
  if (mowed) return theme.sprites.grassMowed;
  return variantFor(theme.sprites.grassUnmowed, cell);
}

/**
 * The cells the mower may legally enter next from its current position: a passable
 * neighbour that is not an already-mowed mowable cell (entering one is the revisit
 * crash, §2). Drives the move-affordance hints — and, being pure, is unit-testable.
 * Empty when the game is not in play.
 */
export function legalNeighbors(level: Level, state: GameState): CellId[] {
  if (state.status !== 'playing') return [];
  const out: CellId[] = [];
  for (const dir of level.topology.directions) {
    const next = level.topology.neighbor(state.position, dir);
    if (next === undefined) continue;
    const traits = traitsOf(level, next);
    if (!traits.passable) continue;
    if (traits.mowable && state.mowed.has(next)) continue; // would crash
    out.push(next);
  }
  return out;
}

/** Grid extent (in cell units) covering every cell's layout position. */
function bounds(level: Level): { minX: number; minY: number; cols: number; rows: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cell of level.topology.cells) {
    const { x, y } = level.topology.layout(cell);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, cols: maxX - minX + 1, rows: maxY - minY + 1 };
}

/**
 * Renders a fixed level's evolving GameState to a canvas. Sizes the canvas to the
 * level on construction (handling devicePixelRatio for crisp pixels), then `render`
 * redraws the whole board each move — cheap at v1 grid sizes, and keeps draw logic
 * a pure function of state.
 */
export class CanvasRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly cellSize: number;
  private readonly gap: number;
  private readonly origin: { minX: number; minY: number };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly theme: Theme,
    private readonly level: Level,
    options: RendererOptions = {},
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.gap = options.gap ?? DEFAULT_GAP;

    const { minX, minY, cols, rows } = bounds(level);
    this.origin = { minX, minY };
    this.cellSize = fitCellSize(cols, options);

    const cssWidth = cols * this.cellSize;
    const cssHeight = rows * this.cellSize;
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Crisp integer-scaled pixels for the pixel-art direction (§3).
    ctx.imageSmoothingEnabled = false;
  }

  /** Top-left CSS-pixel corner of a cell's drawing box. */
  private cellOrigin(cell: CellId): { px: number; py: number } {
    const { x, y } = this.level.topology.layout(cell);
    return {
      px: (x - this.origin.minX) * this.cellSize,
      py: (y - this.origin.minY) * this.cellSize,
    };
  }

  /**
   * Redraw the entire board for the given state, the optional timing HUD, and the
   * optional visual-only animation (mower slide, fresh-mow pop, facing). With no
   * `anim` the board draws statically, exactly as before.
   */
  render(state: GameState, hud?: RenderHud, anim?: RenderAnim): void {
    const { ctx, cellSize, gap, theme, level } = this;

    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Cells: base fill then pixel-art sprite. The freshly-mown cell (if any) pops.
    for (const cell of level.topology.cells) {
      const { px, py } = this.cellOrigin(cell);
      const traits = traitsOf(level, cell);
      const mowed = state.mowed.has(cell);
      ctx.fillStyle = cellFill(theme, traits, mowed);
      ctx.fillRect(px + gap, py + gap, cellSize - gap * 2, cellSize - gap * 2);

      const sprite = spriteForCell(theme, traits, mowed, cell);
      if (sprite) {
        const popT = anim?.pop?.cell === cell ? anim.pop.t : undefined;
        if (popT === undefined) {
          drawSprite(ctx, sprite, px, py, cellSize);
        } else {
          this.drawPop(sprite, px, py, popT);
        }
      }
    }

    // Faint hints on the cells the mower can legally step to (move affordance +
    // onboarding aid). Below the mower so it never hides the mower itself.
    if (state.status === 'playing') {
      this.drawAffordances(legalNeighbors(level, state));
    }

    // Start marker (a hollow ring), so the player can see where they began.
    this.drawStartMarker(level.start);

    // On a fail, outline the cell the mower re-mowed ("you revisited *here*").
    if (state.status === 'lost') {
      this.drawRevisitHighlight(state.position);
    }

    // The mower, on top of everything — mid-slide if the app handed us a tween.
    this.drawMower(state, anim);

    // HUD timer sits above the board but below the end overlay's scrim.
    if (hud) this.drawTimer(hud);

    if (state.status !== 'playing') {
      this.drawEndOverlay(state.status, hud);
    }
  }

  /** Draw a just-mown cell's sprite scaled up with a fading flash (the "cut" pop). */
  private drawPop(sprite: Sprite, px: number, py: number, t: number): void {
    const { ctx, cellSize } = this;
    const grow = 0.18 * (1 - t); // up to +18% at the instant of the cut
    const size = cellSize * (1 + grow);
    const off = (cellSize - size) / 2;
    drawSprite(ctx, sprite, px + off, py + off, size);
    ctx.save();
    ctx.globalAlpha = 0.45 * (1 - t);
    ctx.fillStyle = this.theme.mowerAccent;
    ctx.fillRect(px, py, cellSize, cellSize);
    ctx.restore();
  }

  /** Faint centred markers on the cells the mower may legally enter next. */
  private drawAffordances(cells: readonly CellId[]): void {
    const { ctx, cellSize, theme } = this;
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = theme.affordance;
    for (const cell of cells) {
      const { px, py } = this.cellOrigin(cell);
      const cx = px + cellSize / 2;
      const cy = py + cellSize / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, cellSize * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawStartMarker(cell: CellId): void {
    const { ctx, cellSize } = this;
    const { px, py } = this.cellOrigin(cell);
    const cx = px + cellSize / 2;
    const cy = py + cellSize / 2;
    ctx.strokeStyle = this.theme.startMarker;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, cellSize * 0.32, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawRevisitHighlight(cell: CellId): void {
    const { ctx, cellSize, gap } = this;
    const { px, py } = this.cellOrigin(cell);
    ctx.strokeStyle = this.theme.revisitHighlight;
    ctx.lineWidth = 4;
    ctx.strokeRect(px + gap, py + gap, cellSize - gap * 2, cellSize - gap * 2);
  }

  /**
   * Draw the mower's directional pixel-art sprite. Mid-slide (anim.mower present)
   * it is interpolated between the two cells and faces its heading; at rest it sits
   * on its logical cell facing its last heading (default right).
   */
  private drawMower(state: GameState, anim?: RenderAnim): void {
    const { ctx, cellSize, theme } = this;
    const slide = anim?.mower;
    const facing = slide?.facing ?? anim?.facing ?? DEFAULT_FACING;

    let px: number;
    let py: number;
    if (slide) {
      const a = this.cellOrigin(slide.from);
      const b = this.cellOrigin(slide.to);
      px = a.px + (b.px - a.px) * slide.t;
      py = a.py + (b.py - a.py) * slide.t;
    } else {
      ({ px, py } = this.cellOrigin(state.position));
    }

    drawSprite(ctx, theme.sprites.mower[facing], px, py, cellSize);
  }

  /** Top-left clock readout: elapsed time, plus the limit and a danger tint if timed. */
  private drawTimer(hud: RenderHud): void {
    const { ctx, theme, cellSize } = this;
    const danger = hud.remainingMs !== undefined && hud.remainingMs <= DANGER_THRESHOLD_MS;
    let text = formatTime(hud.elapsedMs);
    if (hud.timeLimitMs !== undefined) text += ` / ${formatTime(hud.timeLimitMs)}`;

    const pad = Math.round(cellSize * 0.18);
    ctx.fillStyle = danger ? theme.hudDanger : theme.hudText;
    ctx.font = `bold ${Math.round(cellSize * 0.34)}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, pad, pad);
  }

  private drawEndOverlay(status: 'won' | 'lost', hud?: RenderHud): void {
    const { ctx, theme } = this;
    const w = this.canvas.clientWidth || this.canvas.width;
    const h = this.canvas.clientHeight || this.canvas.height;

    ctx.fillStyle = theme.overlayScrim;
    ctx.fillRect(0, 0, w, h);

    const won = status === 'won';
    const timedOut = hud?.failReason === 'timeout';
    const title = won ? 'You won!' : timedOut ? "Time's up!" : 'You crashed!';
    // Winners see their score; losers see why (the crash cell is also highlighted).
    const subtitle = won
      ? formatTime(hud?.elapsedMs ?? 0)
      : timedOut
        ? 'Out of time'
        : 'Re-mowed a tile';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = won ? theme.winText : theme.loseText;
    ctx.font = `bold ${Math.round(this.cellSize * 0.6)}px system-ui, sans-serif`;
    ctx.fillText(title, w / 2, h / 2 - this.cellSize * 0.35);

    ctx.fillStyle = theme.hudText;
    ctx.font = `${Math.round(this.cellSize * 0.36)}px system-ui, sans-serif`;
    ctx.fillText(subtitle, w / 2, h / 2 + this.cellSize * 0.35);
  }
}
