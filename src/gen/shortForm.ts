// Short-form level codes (M3): a compact, shareable string that expands into a
// generated Level (lawnmower.md §5 "Level formats" #1). Shape:
//
//     <version>.<seed>.<width>x<height>.<coverage%>
//     e.g.  1.12345.10x8.70
//
// The leading VERSION tag pins which generator algorithm the code was minted
// against. If a future algorithm changes, an old code decodes against a version
// we no longer recognise and we *fail loudly* rather than silently expand it into
// a different level (which would break shared seeds / daily challenges / stored
// best-times). Policy is to keep live versions minimal — the tag exists so
// mismatches are *detected*, not so every version is preserved forever.

import type { Level } from '../model/index.ts';
import { generate, type GeneratorConfig } from './generator.ts';

/** Current generator algorithm version. Bump only on a generation-changing edit. */
export const GENERATOR_VERSION = 1;

const SEPARATOR = '.';

/** Encode a config into its short-form code under the current generator version. */
export function encodeShortForm(config: GeneratorConfig): string {
  const coveragePercent = Math.round(config.coverage * 100);
  return [GENERATOR_VERSION, config.seed, `${config.width}x${config.height}`, coveragePercent].join(
    SEPARATOR,
  );
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
 * Decode a short-form code into a GeneratorConfig. Throws on a malformed code or,
 * critically, on a generator-version mismatch — so an unrecognised code is never
 * silently expanded into the wrong level.
 */
export function decodeShortForm(code: string): GeneratorConfig {
  const parts = code.trim().split(SEPARATOR);
  if (parts.length !== 4) {
    throw new Error(`Malformed short-form code (expected 4 parts): "${code}"`);
  }
  const [versionPart, seedPart, sizePart, coveragePart] = parts;

  const version = parseInteger(versionPart, 'version');
  if (version !== GENERATOR_VERSION) {
    throw new Error(
      `Unsupported generator version ${version} (this build produces ` +
        `v${GENERATOR_VERSION}); refusing to decode "${code}"`,
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

  return { seed, width, height, coverage: coveragePercent / 100 };
}

/** Decode a short-form code and generate its Level in one step. */
export function levelFromShortForm(code: string): Level {
  return generate(decodeShortForm(code)).level;
}
