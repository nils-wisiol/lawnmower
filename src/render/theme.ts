// Theme layer (lawnmower.md §3/§5): rendering pulls every color/sprite through a
// swappable Theme so a full reskin is an asset/data swap, not a code change. Keep
// NO color constants hardcoded in the renderer — they all live here. M2 shipped
// flat placeholder colors; M6 adds the pixel-art `sprites` set (grass, water,
// flowers, trees, the directional mower) drawn on top of them, through this same
// interface with no renderer/logic changes. The colors remain as the base fill
// under each sprite (and drive the HUD/overlay/text, which stay flat).

import { gardenSprites } from './gardenSprites.ts';
import type { Sprite } from './sprite.ts';
import type { Facing } from '../model/index.ts';

/** The pixel-art assets a theme draws over its base fills (lawnmower.md §3). */
export interface ThemeSprites {
  /** Uncut grass variants, picked per-cell for texture variety. */
  readonly grassUnmowed: readonly Sprite[];
  /** Freshly-mown lawn (the visible trail). */
  readonly grassMowed: Sprite;
  /** Passable-but-not-mowable path (forward-compat tile). */
  readonly path: Sprite;
  /**
   * Water-body tiles, indexed by a WATER_EDGE bitmask of which orthogonal neighbours
   * are also water (16 entries). The renderer picks the entry matching a water cell's
   * neighbours so edges and corners bank onto the lawn; index 15 is the full interior.
   */
  readonly water: readonly Sprite[];
  /** Tree variants, picked per-cell for the 'tree' decor. */
  readonly trees: readonly Sprite[];
  /** Flower variants, picked per-cell for the 'flower' decor. */
  readonly flowers: readonly Sprite[];
  /** A fountain standing in a water body, for the 'water-fountain' decor. */
  readonly waterFountain: Sprite;
  /** A fountain on a grassy patch, for the 'lawn-fountain' decor. */
  readonly lawnFountain: Sprite;
  /** Fallback obstacle pool for cells with no decor (hand-authored levels), picked by hash. */
  readonly obstacles: readonly Sprite[];
  /** The mower, one sprite per cardinal heading so it faces the way it last moved. */
  readonly mower: Record<Facing, Sprite>;
}

/**
 * Everything the renderer needs to draw a level. Colors are chosen per *trait
 * combination + mow state*, never per tile-name enum, mirroring the trait-based
 * cell model (§5) so new tile kinds theme themselves from their traits.
 */
export interface Theme {
  readonly name: string;
  /** Page/canvas backdrop behind the grid. */
  readonly background: string;
  /** Thin separator drawn between cells for legibility. */
  readonly gridLine: string;

  // Cell fills, keyed by what the cell *is* (traits) and whether it's mowed.
  /** passable + mowable, not yet mowed. */
  readonly grassUnmowed: string;
  /** passable + mowable, already mowed (the visible trail). */
  readonly grassMowed: string;
  /** impassable (obstacle: lake/flower/tree). */
  readonly obstacle: string;
  /** passable + NOT mowable (a path you may cross freely; forward-compat tile). */
  readonly path: string;

  /** Ring marking the fixed start cell. */
  readonly startMarker: string;
  /** The mower sprite (placeholder: simple shapes). */
  readonly mowerBody: string;
  readonly mowerAccent: string;

  /** Faint marker on cells the mower can legally enter next (move affordance, §3). */
  readonly affordance: string;

  /** Pixel-art assets drawn over the base fills (§3). */
  readonly sprites: ThemeSprites;

  /** On-board timer readout (the HUD clock). */
  readonly hudText: string;
  /** Timer readout when the level's time limit is nearly up (warning tint). */
  readonly hudDanger: string;

  /** Dimming scrim drawn over the board on win/fail. */
  readonly overlayScrim: string;
  readonly winText: string;
  readonly loseText: string;
  /** Outline on the exact cell whose re-mow caused a fail ("you revisited *here*"). */
  readonly revisitHighlight: string;
}

/**
 * v1's single garden theme. Flat base colors (which already read as a garden:
 * green lawn, blue water, sandy path) with the M6 pixel-art `sprites` layered on
 * top. The base fill shows through any sprite transparency and behind the mower.
 */
export const gardenTheme: Theme = {
  name: 'garden',
  background: '#1e2b1a',
  gridLine: '#16210f',

  // Uncut grass reads as deep/overgrown (darker); a freshly mown stripe reads as
  // the bright, pale-green of just-cut lawn — so the mown trail lightens as you go.
  grassUnmowed: '#3c6b2a',
  grassMowed: '#5a9e3f',
  obstacle: '#3f6f9e',
  path: '#c8b071',

  startMarker: '#f2e9c9',
  mowerBody: '#d94c3d',
  mowerAccent: '#f2e9c9',

  affordance: '#eaf6c9',
  sprites: gardenSprites,

  hudText: '#eaf6c9',
  hudDanger: '#f2b3ab',

  overlayScrim: 'rgba(10, 16, 8, 0.66)',
  winText: '#eaf6c9',
  loseText: '#f2b3ab',
  revisitHighlight: '#f2b3ab',
};
