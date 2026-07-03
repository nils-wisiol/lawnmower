// Public surface of the level generator (M3). Seeded self-avoiding-walk levels
// (solvable by construction) plus short-form seed codes that expand into them.

export { createRng, type Rng } from './rng.ts';
export {
  generate,
  generateLevel,
  type GeneratorConfig,
  type GeneratedLevel,
  type GridShape,
} from './generator.ts';
export {
  GENERATOR_VERSION,
  encodeShortForm,
  decodeShortForm,
  levelFromShortForm,
} from './shortForm.ts';
