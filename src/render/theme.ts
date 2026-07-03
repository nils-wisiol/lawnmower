// Theme layer (lawnmower.md §3/§5): rendering pulls every color/sprite through a
// swappable Theme so a full reskin is an asset/data swap, not a code change. Keep
// NO color constants hardcoded in the renderer — they all live here. M2 ships a
// single placeholder garden theme; M6 replaces it with real pixel-art assets
// through this same interface, with no renderer/logic changes.

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
 * v1's single garden theme. Deliberately flat placeholder colors that already
 * read as a garden (green lawn, blue-grey water/obstacles, sandy path). MI2-style
 * pixel art (§3) slots in later behind the same interface.
 */
export const gardenTheme: Theme = {
  name: 'garden',
  background: '#1e2b1a',
  gridLine: '#16210f',

  grassUnmowed: '#5a9e3f',
  grassMowed: '#3c6b2a',
  obstacle: '#3f5a74',
  path: '#c8b071',

  startMarker: '#f2e9c9',
  mowerBody: '#d94c3d',
  mowerAccent: '#f2e9c9',

  hudText: '#eaf6c9',
  hudDanger: '#f2b3ab',

  overlayScrim: 'rgba(10, 16, 8, 0.66)',
  winText: '#eaf6c9',
  loseText: '#f2b3ab',
  revisitHighlight: '#f2b3ab',
};
