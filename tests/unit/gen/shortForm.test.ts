import { describe, expect, it } from 'vitest';

import { traitsOf } from '../../../src/model/index.ts';
import {
  GENERATOR_VERSION,
  SHAPE_TAGGED_VERSION,
  decodeShortForm,
  encodeShortForm,
  generate,
  levelFromShortForm,
  type GeneratorConfig,
} from '../../../src/gen/index.ts';

const CONFIG: GeneratorConfig = { seed: 12345, width: 10, height: 8, coverage: 0.7 };
const HEX_CONFIG: GeneratorConfig = { ...CONFIG, shape: 'hex' };

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

describe('short-form — hex geometry tag (hexagonal.md §2.5)', () => {
  it('encodes hex as the 5-part v3 shape-tagged form, square stays 4-part v2', () => {
    expect(encodeShortForm(HEX_CONFIG)).toBe(`${SHAPE_TAGGED_VERSION}.hex.12345.10x8.70`);
    // A square level (no shape / shape: 'square') keeps the original tag-less code.
    expect(encodeShortForm(CONFIG)).toBe(`${GENERATOR_VERSION}.12345.10x8.70`);
    expect(encodeShortForm({ ...CONFIG, shape: 'square' })).toBe(
      `${GENERATOR_VERSION}.12345.10x8.70`,
    );
  });

  it('round-trips a hex config through encode → decode', () => {
    expect(decodeShortForm(encodeShortForm(HEX_CONFIG))).toEqual(HEX_CONFIG);
  });

  it('decodes a tag-less code as square (no shape field, generator default)', () => {
    expect(decodeShortForm(`${GENERATOR_VERSION}.12345.10x8.70`)).toEqual(CONFIG);
  });

  it('expands a hex code to an actual hex board (6-way adjacency)', () => {
    const level = levelFromShortForm(`${SHAPE_TAGGED_VERSION}.hex.12345.10x8.70`);
    expect(level.topology.directions).toHaveLength(6);
  });

  it('rejects an unknown shape tag', () => {
    expect(() => decodeShortForm(`${SHAPE_TAGGED_VERSION}.triangle.12345.10x8.70`)).toThrow(
      /shape/,
    );
  });

  it('rejects a tagged code carrying the wrong version', () => {
    expect(() => decodeShortForm(`${GENERATOR_VERSION}.hex.12345.10x8.70`)).toThrow(
      /Unsupported generator version/,
    );
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
    expect(() => decodeShortForm(`${V}.12345.10x8`)).toThrow(/4 or 5 parts/);
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
