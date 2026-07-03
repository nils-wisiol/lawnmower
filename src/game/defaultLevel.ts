// The levels the app boots and hands out (M3, extended in M5 for seed sharing).
// Every level now travels with its short-form code (a "coded level"), because M5
// puts that code in the URL so a level is shareable (see game/levelUrl). Generated
// levels are solvable by construction (seeded self-avoiding walk, §5/§6); the
// hardcoded demo map stays as a deterministic fallback if generation ever throws —
// it has no short-form code, so it simply isn't shareable.

import { DEMO_LEVEL_MAP } from './demoLevel.ts';
import { readLevelCode } from './levelUrl.ts';
import { encodeShortForm, levelFromShortForm } from '../gen/index.ts';
import { levelFromAscii, type Level } from '../model/index.ts';

/** Short-form code (version.seed.WxH.coverage%) for the default boot level. */
export const DEFAULT_LEVEL_CODE = '1.20260703.12x9.70';

/** Grid size / coverage the "next lawn" flow generates at (matches the boot level). */
const NEXT_LEVEL_WIDTH = 12;
const NEXT_LEVEL_HEIGHT = 9;
const NEXT_LEVEL_COVERAGE = 0.7;

/**
 * A level paired with the short-form code that reproduces it. `code` is undefined
 * only for the demo-map fallback — an un-shareable level with no seed to encode.
 */
export interface CodedLevel {
  readonly level: Level;
  readonly code?: string;
}

/** The default boot level, or the demo map (no code) if generation throws. */
export function defaultCodedLevel(): CodedLevel {
  try {
    return { level: levelFromShortForm(DEFAULT_LEVEL_CODE), code: DEFAULT_LEVEL_CODE };
  } catch {
    return { level: levelFromAscii(DEMO_LEVEL_MAP) };
  }
}

/**
 * Expand a short-form code into a coded level. A malformed or unsupported-version
 * code (e.g. a link from a future generator) falls back to the default level rather
 * than throwing — a broken share link still lands the player in a playable game.
 */
export function levelFromCode(code: string): CodedLevel {
  try {
    return { level: levelFromShortForm(code), code };
  } catch {
    return defaultCodedLevel();
  }
}

/**
 * Choose the level to boot from a URL hash: the shared code if the hash carries one,
 * otherwise the default level. Pass `location.hash` (or '' in a non-DOM context).
 */
export function bootLevel(hash: string): CodedLevel {
  const code = readLevelCode(hash);
  return code !== undefined ? levelFromCode(code) : defaultCodedLevel();
}

/**
 * A fresh random level for the "next lawn" flow (M4): a new seed each call, so
 * consecutive wins hand out new solvable-by-construction levels — each carrying its
 * code so the URL can advertise it for sharing.
 */
export function randomLevel(): CodedLevel {
  const seed = Math.floor(Math.random() * 0xffffffff);
  const code = encodeShortForm({
    seed,
    width: NEXT_LEVEL_WIDTH,
    height: NEXT_LEVEL_HEIGHT,
    coverage: NEXT_LEVEL_COVERAGE,
  });
  return levelFromCode(code);
}
