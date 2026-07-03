// Canvas 2D renderer (lawnmower.md §5). Draws a GameState by walking the abstract
// cell graph and asking the Topology where each cell lives — it never assumes a
// square grid, so a hex/teleport Topology renders through this same code. Every
// color comes from the injected Theme; there are no palette constants here.

import {
  decorOf,
  formatTime,
  traitsOf,
  type CellId,
  type CellTraits,
  type Decor,
  type Level,
} from '../model/index.ts';
import type { Facing, FailReason, GameState } from '../model/index.ts';
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
    readonly facing: Facing;
  };
  /** A just-mown cell popping. `t` in [0,1] (0 = the instant it was cut, 1 = settled). */
  readonly pop?: { readonly cell: CellId; readonly t: number };
  /** The mower's current heading when at rest, so the idle sprite still faces right. */
  readonly facing?: Facing;
}

/** Below this much time left, the HUD clock turns to the danger colour. */
const DANGER_THRESHOLD_MS = 5000;

const DEFAULT_CELL_SIZE = 48;
const DEFAULT_GAP = 2;

/** Default mower heading before the first move (also the render-test fallback). */
const DEFAULT_FACING: Facing = 'right';

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
 * Pick an obstacle cell's sprite from its decor (lawnmower.md §3): water bodies,
 * trees, and flowers each draw their own art, chosen from level *data* rather than a
 * blind hash. A cell with no decor (hand-authored/ascii levels) falls back to the
 * hashed obstacle pool, preserving the pre-decor look. Tree/flower variety is picked
 * per-cell so a lawn looks the same on every redraw.
 */
/** Wet cells — plain water or a fountain standing in water — for shoreline purposes. */
function isWater(decor: Decor | undefined): boolean {
  return decor === 'water' || decor === 'water-fountain';
}

/**
 * The directions in which `cell` borders a water neighbour — geometry-blind: it walks
 * the topology's own `directions`, so it names square cardinals or hex directions alike.
 * `theme.sprites.waterSprite` turns this set (plus the vocabulary) into the tile that
 * banks onto the lawn on the land sides, square or hex (hexagonal.md H4).
 */
function waterDirs(level: Level, cell: CellId): Set<string> {
  const dirs = new Set<string>();
  for (const dir of level.topology.directions) {
    const n = level.topology.neighbor(cell, dir);
    if (n !== undefined && isWater(decorOf(level, n))) dirs.add(dir);
  }
  return dirs;
}

function obstacleSprite(theme: Theme, level: Level, cell: CellId): Sprite | undefined {
  switch (decorOf(level, cell)) {
    case 'water':
      return theme.sprites.waterSprite(level.topology.directions, waterDirs(level, cell));
    case 'water-fountain':
      return theme.sprites.waterFountain;
    case 'lawn-fountain':
      return theme.sprites.lawnFountain;
    case 'tree':
      return variantFor(theme.sprites.trees, cell);
    case 'flower':
      return variantFor(theme.sprites.flowers, cell);
    default:
      return variantFor(theme.sprites.obstacles, cell);
  }
}

/**
 * Pick a cell's pixel-art sprite from its traits and mow state — the sprite mirror
 * of `cellFill`, and of the trait-based model (§5): a cell is drawn by *what it is*,
 * not a tile enum, so a new trait combination sprites itself. Obstacles additionally
 * consult their decor (water/tree/flower) via `obstacleSprite`. Variety is chosen
 * deterministically per cell so a lawn looks the same on every redraw. Returns
 * undefined only if a variant list is empty (the base `cellFill` colour then stands
 * in). Exported for unit testing without a canvas.
 */
export function spriteForCell(
  theme: Theme,
  level: Level,
  cell: CellId,
  mowed: boolean,
): Sprite | undefined {
  const traits = traitsOf(level, cell);
  if (!traits.passable) return obstacleSprite(theme, level, cell);
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

/** Axis-aligned min/max of a set of points (a cell polygon's or a board's extent). */
function extentOf(points: readonly { x: number; y: number }[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y } of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Board extent in cell-units, measured from the actual cell *outlines* (each cell's
 * `cellPolygon` around its centre), not just the centre points — so a hexagon's
 * pointed sides and half-row offsets are included and the fit math is correct for
 * offset-row packing (hexagonal.md H3). `minX`/`minY` are the top-left-most vertex
 * (the board origin); `width`/`height` are the full outline span. For a square grid
 * the ±½-cell polygon reproduces the old `cols`×`rows` extent exactly. Exported so
 * the fit/packing is unit-testable without a canvas.
 */
export function boardExtent(level: Level): {
  minX: number;
  minY: number;
  width: number;
  height: number;
} {
  const centres = level.topology.cells.map((c) => level.topology.layout(c));
  const c = extentOf(centres);
  const p = extentOf(level.topology.cellPolygon());
  const minX = c.minX + p.minX;
  const minY = c.minY + p.minY;
  const maxX = c.maxX + p.maxX;
  const maxY = c.maxY + p.maxY;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

/** The board's top-left-most vertex in cell-units — the origin pixel positions map from. */
export interface BoardOrigin {
  readonly minX: number;
  readonly minY: number;
}

/**
 * A cell's centre in CSS pixels: its `layout` point mapped through the board origin and
 * `cellSize` scale. Pure (no canvas), so the placement is unit-testable; the renderer
 * positions sprites, markers and the mower through it.
 */
export function cellCenterPx(
  level: Level,
  cell: CellId,
  cellSize: number,
  origin: BoardOrigin,
): { cx: number; cy: number } {
  const { x, y } = level.topology.layout(cell);
  return { cx: (x - origin.minX) * cellSize, cy: (y - origin.minY) * cellSize };
}

/**
 * The cell under a CSS-pixel point (0,0 = the board's top-left), or undefined if the
 * point is off the board — the inverse of `cellCenterPx`. It undoes the origin/scale to
 * recover cell-units, then hands off to `topology.cellAt` so the point→cell test stays
 * geometry-blind (hexagonal.md §2.6). Pure, so click/tap hit-testing is unit-testable.
 */
export function cellAtPx(
  level: Level,
  cssX: number,
  cssY: number,
  cellSize: number,
  origin: BoardOrigin,
): CellId | undefined {
  return level.topology.cellAt({
    x: cssX / cellSize + origin.minX,
    y: cssY / cellSize + origin.minY,
  });
}

/** Distance from the centre (0,0) to the nearest edge of a centred convex polygon. */
function polygonApothem(poly: readonly { x: number; y: number }[]): number {
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dist = Math.abs(a.x * b.y - a.y * b.x) / Math.hypot(b.x - a.x, b.y - a.y);
    if (dist < min) min = dist;
  }
  return min;
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
  /** The cell outline shared by every cell (unit-scale, centred), cached from the topology. */
  private readonly polygon: readonly { x: number; y: number }[];
  /** Centre-to-edge distance of `polygon` (cell-units) — the basis for the gap inset. */
  private readonly apothem: number;
  /** Side of the centred square a cell's sprite is drawn into (cell-units): the smaller
   * outline dimension, so the sprite sits inside the cell (a hexagon's pointed sides
   * keep their base fill). For a square cell this is a full 1-cell box (unchanged). */
  private readonly spriteSide: number;

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

    this.polygon = level.topology.cellPolygon();
    this.apothem = polygonApothem(this.polygon);
    const poly = extentOf(this.polygon);
    this.spriteSide = Math.min(poly.maxX - poly.minX, poly.maxY - poly.minY);

    const extent = boardExtent(level);
    this.origin = { minX: extent.minX, minY: extent.minY };
    this.cellSize = fitCellSize(extent.width, options);

    const cssWidth = extent.width * this.cellSize;
    const cssHeight = extent.height * this.cellSize;
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Crisp integer-scaled pixels for the pixel-art direction (§3).
    ctx.imageSmoothingEnabled = false;
  }

  /** A cell's centre in CSS pixels (its `layout` point mapped through origin + scale). */
  private cellCenter(cell: CellId): { cx: number; cy: number } {
    return cellCenterPx(this.level, cell, this.cellSize, this.origin);
  }

  /**
   * Trace the cell's outline (from `topology.cellPolygon`) as a canvas path in CSS
   * pixels, its vertices scaled toward the centre by `shrink` (1 = the full cell).
   * The renderer paths squares or hexagons through this one helper, geometry-blind.
   */
  private tracePolygon(cell: CellId, shrink: number): void {
    const { ctx, cellSize, polygon } = this;
    const { cx, cy } = this.cellCenter(cell);
    ctx.beginPath();
    for (let i = 0; i < polygon.length; i++) {
      const px = cx + polygon[i].x * shrink * cellSize;
      const py = cy + polygon[i].y * shrink * cellSize;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  /** Shrink factor that insets a cell's outline by `gap` CSS pixels on every edge. */
  private get fillShrink(): number {
    return Math.max(0, 1 - this.gap / (this.apothem * this.cellSize));
  }

  /**
   * The cell under a CSS-pixel point (0,0 = the canvas's top-left), or undefined if
   * the point is off the board — the inverse of `cellCenter`, delegating the actual
   * point→cell test to `topology.cellAt` so it stays geometry-blind (hexagonal.md
   * §2.6). This is what turns a click/tap position into a move target: invert the
   * origin/scale back into cell-units, then let the topology round to its own cell.
   */
  cellAtPixel(cssX: number, cssY: number): CellId | undefined {
    return cellAtPx(this.level, cssX, cssY, this.cellSize, this.origin);
  }

  /**
   * Redraw the entire board for the given state, the optional timing HUD, and the
   * optional visual-only animation (mower slide, fresh-mow pop, facing). With no
   * `anim` the board draws statically, exactly as before.
   */
  render(state: GameState, hud?: RenderHud, anim?: RenderAnim): void {
    const { ctx, theme, level } = this;

    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Cells: base fill then pixel-art sprite. The freshly-mown cell (if any) pops.
    for (const cell of level.topology.cells) {
      const traits = traitsOf(level, cell);
      const mowed = state.mowed.has(cell);

      // Fill the cell outline, inset by `gap` so the board reads as tiled cells.
      ctx.fillStyle = cellFill(theme, traits, mowed);
      this.tracePolygon(cell, this.fillShrink);
      ctx.fill();

      const sprite = spriteForCell(theme, level, cell, mowed);
      if (sprite) {
        const popT = anim?.pop?.cell === cell ? anim.pop.t : undefined;
        if (popT === undefined) {
          this.drawCellSprite(cell, sprite);
        } else {
          this.drawPop(cell, sprite, popT);
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

  /** Draw a sprite into the centred `spriteSide` box at a pixel centre (see spriteSide). */
  private drawSpriteAt(sprite: Sprite, cx: number, cy: number, scale = 1): void {
    const side = this.spriteSide * this.cellSize * scale;
    drawSprite(this.ctx, sprite, cx - side / 2, cy - side / 2, side);
  }

  /** Draw a cell's sprite, clipped to the cell outline so it sits inside the shape. */
  private drawCellSprite(cell: CellId, sprite: Sprite): void {
    const { ctx } = this;
    const { cx, cy } = this.cellCenter(cell);
    ctx.save();
    this.tracePolygon(cell, 1);
    ctx.clip();
    this.drawSpriteAt(sprite, cx, cy);
    ctx.restore();
  }

  /** Draw a just-mown cell's sprite scaled up with a fading flash (the "cut" pop). */
  private drawPop(cell: CellId, sprite: Sprite, t: number): void {
    const { ctx } = this;
    const { cx, cy } = this.cellCenter(cell);
    const grow = 0.18 * (1 - t); // up to +18% at the instant of the cut
    this.drawSpriteAt(sprite, cx, cy, 1 + grow);
    ctx.save();
    ctx.globalAlpha = 0.45 * (1 - t);
    ctx.fillStyle = this.theme.mowerAccent;
    this.tracePolygon(cell, 1);
    ctx.fill();
    ctx.restore();
  }

  /** Faint centred markers on the cells the mower may legally enter next. */
  private drawAffordances(cells: readonly CellId[]): void {
    const { ctx, cellSize, theme } = this;
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = theme.affordance;
    for (const cell of cells) {
      const { cx, cy } = this.cellCenter(cell);
      ctx.beginPath();
      ctx.arc(cx, cy, cellSize * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawStartMarker(cell: CellId): void {
    const { ctx, cellSize } = this;
    const { cx, cy } = this.cellCenter(cell);
    ctx.strokeStyle = this.theme.startMarker;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, cellSize * 0.32, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawRevisitHighlight(cell: CellId): void {
    const { ctx } = this;
    ctx.strokeStyle = this.theme.revisitHighlight;
    ctx.lineWidth = 4;
    this.tracePolygon(cell, this.fillShrink);
    ctx.stroke();
  }

  /**
   * Draw the mower's directional pixel-art sprite. Mid-slide (anim.mower present)
   * it is interpolated between the two cells' centres and faces its heading; at rest
   * it sits on its logical cell facing its last heading (default right).
   */
  private drawMower(state: GameState, anim?: RenderAnim): void {
    const { theme } = this;
    const slide = anim?.mower;
    const facing = slide?.facing ?? anim?.facing ?? DEFAULT_FACING;

    let cx: number;
    let cy: number;
    if (slide) {
      const a = this.cellCenter(slide.from);
      const b = this.cellCenter(slide.to);
      cx = a.cx + (b.cx - a.cx) * slide.t;
      cy = a.cy + (b.cy - a.cy) * slide.t;
    } else {
      ({ cx, cy } = this.cellCenter(state.position));
    }

    this.drawSpriteAt(theme.sprites.mower[facing], cx, cy);
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
