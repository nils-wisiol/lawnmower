// Short-form level codes (M3; hex tag hexagonal.md §2.5): a compact, shareable string
// that expands into a generated Level (lawnmower.md §5 "Level formats" #1). Two shapes:
//
//     <version>.<seed>.<width>x<height>.<coverage%>            (v2, implicit square)
//     <version>.<shape>.<seed>.<width>x<height>.<coverage%>    (v3, explicit geometry)
//     e.g.  2.12345.10x8.70   or   3.hex.12345.10x8.70
//
// The leading VERSION tag pins which generator algorithm the code was minted
// against. If a future algorithm changes, an old code decodes against a version
// we no longer recognise and we *fail loudly* rather than silently expand it into
// a different level (which would break shared seeds / daily challenges / stored
// best-times). Policy is to keep live versions minimal — the tag exists so
// mismatches are *detected*, not so every version is preserved forever. The v3 form
// adds an explicit geometry so a hex level is self-describing; a tag-less v2 code
// keeps decoding as square, so existing square links and the square path are unchanged.

import type { Level } from '../model/index.ts';
import { generate, type GeneratorConfig, type GridShape } from './generator.ts';

/**
 * Current generator algorithm version. Bump only on a generation-changing edit.
 * v2 adds clustered water bodies and per-obstacle decoration (lawnmower.md §3):
 * traits/walk are byte-identical to v1 for a seed, but the level now looks different,
 * so an old code must decode against v1 and fail loudly rather than silently reskin.
 */
export const GENERATOR_VERSION = 2;

/**
 * Version of the *shape-tagged* form (hexagonal.md §2.5). A v3 code carries an explicit
 * geometry between the version and seed — `3.hex.12345.10x8.70` — while a tag-less
 * 4-part code stays v2 and decodes as `square`, so existing square links keep working
 * and the square generation path is byte-for-byte unchanged. Only the geometry a v3
 * code names is accepted; an unknown shape (or version) still fails loudly.
 *
 * This lands the encode/decode of the tag so a hex level is loadable and shareable by
 * URL (H3's browser playthrough needs it). The rest of H5 — the size/shape control,
 * onboarding copy, and the round-trip share e2e — remains.
 */
export const SHAPE_TAGGED_VERSION = 3;

/** The geometry a tag-less (v2) code implies. */
const IMPLICIT_SHAPE: GridShape = 'square';

const SEPARATOR = '.';

/**
 * Encode a config into its short-form code. A square level encodes as the original
 * 4-part v2 code (unchanged, so shared square links and the default code stay stable);
 * any other geometry encodes as the 5-part v3 shape-tagged form.
 */
export function encodeShortForm(config: GeneratorConfig): string {
  const coveragePercent = Math.round(config.coverage * 100);
  const size = `${config.width}x${config.height}`;
  const shape = config.shape ?? IMPLICIT_SHAPE;
  if (shape === IMPLICIT_SHAPE) {
    return [GENERATOR_VERSION, config.seed, size, coveragePercent].join(SEPARATOR);
  }
  return [SHAPE_TAGGED_VERSION, shape, config.seed, size, coveragePercent].join(SEPARATOR);
}

/** Parse a geometry tag, rejecting anything but the known shapes (fail loudly). */
function parseShape(value: string): GridShape {
  if (value === 'square' || value === 'hex') return value;
  throw new Error(`Short-form shape must be "square" or "hex", got "${value}"`);
}

function parseInteger(value: string, label: string): number {
  // Reject the coercions Number() tolerates (e.g. '', '  ', '1x') so a malformed
  // code fails loudly instead of decoding to a surprising level.
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`Short-form ${label} is not an integer: "${value}"`);
  }
  return Number(value);
}

/**
 * Decode a short-form code into a GeneratorConfig. Accepts the 4-part v2 form (implicit
 * square) and the 5-part v3 form (explicit `square`/`hex`). Throws on a malformed code
 * or, critically, on a version/shape mismatch — so an unrecognised code is never
 * silently expanded into the wrong level. A square code yields no `shape` field (it is
 * the generator default), so a 4-part code round-trips through encode unchanged.
 */
export function decodeShortForm(code: string): GeneratorConfig {
  const parts = code.trim().split(SEPARATOR);
  if (parts.length !== 4 && parts.length !== 5) {
    throw new Error(`Malformed short-form code (expected 4 or 5 parts): "${code}"`);
  }

  // The v3 form inserts an explicit shape tag between the version and the seed; the
  // v2 form has no tag and means square. Pull out the tag (if present) and pin the
  // version each form requires, then share the seed/size/coverage parsing below.
  const tagged = parts.length === 5;
  const versionPart = parts[0];
  const shape: GridShape | undefined = tagged ? parseShape(parts[1]) : undefined;
  const [seedPart, sizePart, coveragePart] = tagged ? parts.slice(2) : parts.slice(1);

  const version = parseInteger(versionPart, 'version');
  const expected = tagged ? SHAPE_TAGGED_VERSION : GENERATOR_VERSION;
  if (version !== expected) {
    throw new Error(
      `Unsupported generator version ${version} (this build produces ` +
        `v${GENERATOR_VERSION}${tagged ? `/v${SHAPE_TAGGED_VERSION} tagged` : ''}); ` +
        `refusing to decode "${code}"`,
    );
  }

  const seed = parseInteger(seedPart, 'seed');

  const sizeMatch = /^(\d+)x(\d+)$/.exec(sizePart);
  if (sizeMatch === null) {
    throw new Error(`Short-form size must look like "WxH", got "${sizePart}"`);
  }
  const width = Number(sizeMatch[1]);
  const height = Number(sizeMatch[2]);

  const coveragePercent = parseInteger(coveragePart, 'coverage');
  if (coveragePercent <= 0 || coveragePercent > 100) {
    throw new Error(`Short-form coverage% must be in (0, 100], got ${coveragePercent}`);
  }

  const config: GeneratorConfig = { seed, width, height, coverage: coveragePercent / 100 };
  return shape === undefined ? config : { ...config, shape };
}

/** Decode a short-form code and generate its Level in one step. */
export function levelFromShortForm(code: string): Level {
  return generate(decodeShortForm(code)).level;
}
