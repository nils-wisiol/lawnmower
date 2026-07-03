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

/** Fixed seed for the deterministic default boot level (today's daily lawn). */
const DEFAULT_SEED = 20260703;

/** Coverage the default and "next lawn" levels generate at. */
const NEXT_LEVEL_COVERAGE = 0.7;

/** Grid dimensions in cells. */
export interface LevelSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Fallback grid size when no viewport is known (non-DOM boot, tests). The
 * DEFAULT_LEVEL_CODE constant is minted from it, so it also pins the level a
 * broken/short share link falls back to.
 */
const DEFAULT_SIZE: LevelSize = { width: 12, height: 9 };

// Screen-fit tuning (issue: adjust default level size/ratio to the screen, but keep
// it mobile-first — never grow into a huge desktop level).
/** Cell edge (CSS px) we aim to size generated levels around (mirrors the renderer). */
const TARGET_CELL_PX = 48;
/** Vertical space (px) reserved for the title, status line, controls and hint. */
const CHROME_HEIGHT_PX = 260;
/** Playability clamps: a level never shrinks below MIN nor grows past MAX cells. */
const MIN_COLS = 6;
const MAX_COLS = 14;
const MIN_ROWS = 6;
const MAX_ROWS = 12;

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Choose a level's grid size from the viewport so its proportions follow the screen
 * (a portrait phone gets a taller-than-wide lawn, a landscape screen a wider one),
 * while the MIN/MAX clamps keep it playable on a small phone yet stop it ballooning
 * into a superlarge lawn on a big desktop — this is primarily a mobile-fit measure.
 */
export function fitLevelSize(viewport: {
  readonly width: number;
  readonly height: number;
}): LevelSize {
  const cols = clamp(Math.floor(viewport.width / TARGET_CELL_PX), MIN_COLS, MAX_COLS);
  const rows = clamp(
    Math.floor((viewport.height - CHROME_HEIGHT_PX) / TARGET_CELL_PX),
    MIN_ROWS,
    MAX_ROWS,
  );
  return { width: cols, height: rows };
}

/** The short-form code for the default (daily-seed) level at a given grid size. */
function defaultLevelCode(size: LevelSize): string {
  return encodeShortForm({
    seed: DEFAULT_SEED,
    width: size.width,
    height: size.height,
    coverage: NEXT_LEVEL_COVERAGE,
  });
}

/** Short-form code (version.seed.WxH.coverage%) for the default boot level. */
export const DEFAULT_LEVEL_CODE = defaultLevelCode(DEFAULT_SIZE);

/**
 * A level paired with the short-form code that reproduces it. `code` is undefined
 * only for the demo-map fallback — an un-shareable level with no seed to encode.
 */
export interface CodedLevel {
  readonly level: Level;
  readonly code?: string;
}

/**
 * The default boot level at `size` (default a fixed 12x9), or the demo map (no
 * code) if generation throws. `size` lets the boot flow fit the level to the
 * screen (see fitLevelSize); callers with no viewport get the fixed default.
 */
export function defaultCodedLevel(size: LevelSize = DEFAULT_SIZE): CodedLevel {
  const code = defaultLevelCode(size);
  try {
    return { level: levelFromShortForm(code), code };
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
export function bootLevel(hash: string, size: LevelSize = DEFAULT_SIZE): CodedLevel {
  const code = readLevelCode(hash);
  return code !== undefined ? levelFromCode(code) : defaultCodedLevel(size);
}

/**
 * A fresh random level for the "next lawn" flow (M4): a new seed each call, so
 * consecutive wins hand out new solvable-by-construction levels — each carrying its
 * code so the URL can advertise it for sharing.
 */
export function randomLevel(size: LevelSize = DEFAULT_SIZE): CodedLevel {
  const seed = Math.floor(Math.random() * 0xffffffff);
  const code = encodeShortForm({
    seed,
    width: size.width,
    height: size.height,
    coverage: NEXT_LEVEL_COVERAGE,
  });
  return levelFromCode(code);
}
