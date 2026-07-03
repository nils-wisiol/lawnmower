import { describe, expect, it } from 'vitest';

import { traitsOf } from '../../../src/model/index.ts';
import {
  GENERATOR_VERSION,
  decodeShortForm,
  encodeShortForm,
  generate,
  levelFromShortForm,
  type GeneratorConfig,
} from '../../../src/gen/index.ts';

const CONFIG: GeneratorConfig = { seed: 12345, width: 10, height: 8, coverage: 0.7 };

describe('short-form encode/decode', () => {
  it('encodes to the versioned <version>.<seed>.<w>x<h>.<cov%> shape', () => {
    expect(encodeShortForm(CONFIG)).toBe(`${GENERATOR_VERSION}.12345.10x8.70`);
  });

  it('round-trips a config through encode → decode', () => {
    expect(decodeShortForm(encodeShortForm(CONFIG))).toEqual(CONFIG);
  });

  it('tolerates surrounding whitespace on decode', () => {
    expect(decodeShortForm(`  ${encodeShortForm(CONFIG)}\n`)).toEqual(CONFIG);
  });
});

describe('short-form — version pinning (mismatch detected, not silently expanded)', () => {
  it('refuses to decode an unrecognised generator version', () => {
    const future = `${GENERATOR_VERSION + 1}.12345.10x8.70`;
    expect(() => decodeShortForm(future)).toThrow(/Unsupported generator version/);
  });
});

describe('short-form — malformed codes fail loudly', () => {
  // Use the live version so these exercise the field checks, not the version guard
  // (which runs first and would otherwise mask a malformed seed/size/coverage).
  const V = GENERATOR_VERSION;

  it('rejects the wrong number of parts', () => {
    expect(() => decodeShortForm(`${V}.12345.10x8`)).toThrow(/4 parts/);
  });

  it('rejects a non-integer seed', () => {
    expect(() => decodeShortForm(`${V}.12x45.10x8.70`)).toThrow(/seed/);
  });

  it('rejects a malformed size', () => {
    expect(() => decodeShortForm(`${V}.12345.10-8.70`)).toThrow(/WxH/);
  });

  it('rejects coverage% outside (0, 100]', () => {
    expect(() => decodeShortForm(`${V}.12345.10x8.0`)).toThrow(/coverage/);
    expect(() => decodeShortForm(`${V}.12345.10x8.150`)).toThrow(/coverage/);
  });
});

describe('levelFromShortForm — code expands to the same level as the config', () => {
  it('matches generate() on the decoded config', () => {
    const fromCode = levelFromShortForm(encodeShortForm(CONFIG));
    const fromConfig = generate(CONFIG).level;
    expect(fromCode.start).toBe(fromConfig.start);
    for (const cell of fromCode.topology.cells) {
      expect(traitsOf(fromCode, cell)).toEqual(traitsOf(fromConfig, cell));
    }
  });
});
