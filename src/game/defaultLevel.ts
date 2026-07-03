// The level the app boots with. M3 makes this a *generated* level (seeded
// self-avoiding walk, solvable by construction) addressed by a short-form code;
// the hardcoded demo map (model/demoLevel) stays as a deterministic fallback if
// generation ever throws. User-chosen seed entry/sharing is M5 — for now the code
// is fixed here.

import { DEMO_LEVEL_MAP } from './demoLevel.ts';
import { encodeShortForm, levelFromShortForm } from '../gen/index.ts';
import { levelFromAscii, type Level } from '../model/index.ts';

/** Short-form code (version.seed.WxH.coverage%) for the default boot level. */
export const DEFAULT_LEVEL_CODE = '1.20260703.12x9.70';

/** Grid size / coverage the "next lawn" flow generates at (matches the boot level). */
const NEXT_LEVEL_WIDTH = 12;
const NEXT_LEVEL_HEIGHT = 9;
const NEXT_LEVEL_COVERAGE = 0.7;

/** Build the default level, falling back to the demo map if generation throws. */
export function defaultLevel(): Level {
  try {
    return levelFromShortForm(DEFAULT_LEVEL_CODE);
  } catch {
    return levelFromAscii(DEMO_LEVEL_MAP);
  }
}

/**
 * Produce a fresh random level for the "next lawn" flow (M4). Each call picks a new
 * seed, so consecutive wins hand the player a new solvable-by-construction level;
 * falls back to the demo map if generation ever throws. Seed entry/sharing is M5 —
 * for now the seed is just random.
 */
export function nextLevel(): Level {
  const seed = Math.floor(Math.random() * 0xffffffff);
  const code = encodeShortForm({
    seed,
    width: NEXT_LEVEL_WIDTH,
    height: NEXT_LEVEL_HEIGHT,
    coverage: NEXT_LEVEL_COVERAGE,
  });
  try {
    return levelFromShortForm(code);
  } catch {
    return levelFromAscii(DEMO_LEVEL_MAP);
  }
}
