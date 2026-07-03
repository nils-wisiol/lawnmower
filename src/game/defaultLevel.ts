// The level the app boots with. M3 makes this a *generated* level (seeded
// self-avoiding walk, solvable by construction) addressed by a short-form code;
// the hardcoded demo map (model/demoLevel) stays as a deterministic fallback if
// generation ever throws. User-chosen seed entry/sharing is M5 — for now the code
// is fixed here.

import { DEMO_LEVEL_MAP } from './demoLevel.ts';
import { levelFromShortForm } from '../gen/index.ts';
import { levelFromAscii, type Level } from '../model/index.ts';

/** Short-form code (version.seed.WxH.coverage%) for the default boot level. */
export const DEFAULT_LEVEL_CODE = '1.20260703.12x9.70';

/** Build the default level, falling back to the demo map if generation throws. */
export function defaultLevel(): Level {
  try {
    return levelFromShortForm(DEFAULT_LEVEL_CODE);
  } catch {
    return levelFromAscii(DEMO_LEVEL_MAP);
  }
}
