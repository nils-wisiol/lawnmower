// Public surface of the core model (M1). Rendering/input (M2) and the generator
// (M3) build on these exports.

export type {
  CellId,
  CellPoint,
  CellTraits,
  Direction,
  InputDirection,
  Level,
  Topology,
} from './types.ts';
export { countMowable, traitsOf } from './types.ts';

export {
  SquareGrid,
  SQUARE_DIRECTIONS,
  cellId,
  coords,
  type SquareDirection,
} from './squareGrid.ts';

export {
  createGame,
  move,
  remainingMowable,
  type GameState,
  type GameStatus,
  type MoveOutcome,
  type MoveResult,
} from './game.ts';

export { levelFromAscii } from './ascii.ts';
