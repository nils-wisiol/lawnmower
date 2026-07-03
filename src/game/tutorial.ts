// First-run onboarding (lawnmower.md §4/§9 M6): a gentle, solvable lawn plus a few
// short contextual coach lines that teach the rules with no wall of text. Built on
// the already solvability-verified demo map (see demoLevel + its test) so the
// tutorial can't ship unwinnable. It carries a reserved level code so it is
// reachable/shareable like any other level — #tutorial (or pasting `tutorial`)
// loads it, and the coach then appears because the loaded code is TUTORIAL_CODE.

import { levelFromAscii } from '../model/index.ts';
import { DEMO_LEVEL_MAP } from './demoLevel.ts';
import type { CodedLevel } from './defaultLevel.ts';

/**
 * Reserved level code for the tutorial. A plain word that cannot collide with a
 * short-form code (`<ver>.<seed>.WxH.NN`), so the boot/decode path can recognise it
 * before attempting generator decoding.
 */
export const TUTORIAL_CODE = 'tutorial';

/**
 * The coach's lines, keyed by where the player is in the run. The app shows the
 * matching one while the tutorial level is loaded (see game/app). Kept terse and
 * action-first so first-timers learn by doing, not reading (§4).
 */
export interface CoachMessages {
  readonly start: string;
  readonly progress: string;
  readonly won: string;
  readonly lost: string;
}

/**
 * Onboarding note for hex levels' 6-way controls (hexagonal.md §2.2/§4, H5). The
 * controls show it while a hex board is loaded: a flat-top hex has six neighbours, so
 * the four arrow keys can't reach them all — the diagonals get their own Q/E/Z/C keys
 * (and swipe/tap-to-move work in six directions). Square play never surfaces it, so
 * the four-arrow default stays uncluttered. Lives here with the rest of the onboarding
 * copy; the controls import it.
 */
export const HEX_CONTROLS_HINT =
  'Hex lawn — 6 directions: use ↑ ↓ and Q / E / Z / C, or swipe / tap a tile.';

export const TUTORIAL_COACH: CoachMessages = {
  start: 'Welcome! Swipe or use the arrow keys to mow a tile of grass.',
  progress: 'Mow every tile — but never drive back over cut grass, and steer around the obstacles.',
  won: "Lawn mowed! You've got it. A fresh lawn is next — race the clock.",
  lost: 'You re-mowed a tile and crashed. Tap or press R to try again.',
};

/**
 * Config the app needs to run the coach: which loaded level it applies to (so it
 * hides once the player moves on to a generated lawn) and what to say.
 */
export interface CoachConfig {
  readonly code: string;
  readonly messages: CoachMessages;
}

/** The coach config the boot flow hands the app for the tutorial level. */
export const TUTORIAL_COACH_CONFIG: CoachConfig = { code: TUTORIAL_CODE, messages: TUTORIAL_COACH };

/** The tutorial as a coded level: the verified demo lawn under the reserved code. */
export function tutorialLevel(): CodedLevel {
  return { level: levelFromAscii(DEMO_LEVEL_MAP), code: TUTORIAL_CODE };
}
