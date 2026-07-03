// Public surface of the core model (M1). Rendering/input (M2) and the generator
// (M3) build on these exports.

export type {
  CellId,
  CellPoint,
  CellTraits,
  Decor,
  Direction,
  InputDirection,
  Level,
  LevelConfig,
  TimerStart,
  Topology,
} from './types.ts';
export { countMowable, decorOf, traitsOf, levelConfig, DEFAULT_LEVEL_CONFIG } from './types.ts';

export { Stopwatch, systemClock, formatTime, type Clock } from './timing.ts';

export {
  SquareGrid,
  SQUARE_DIRECTIONS,
  cellId,
  coords,
  type SquareDirection,
} from './squareGrid.ts';

export { HexGrid, HEX_DIRECTIONS, hexCellId, axial, type HexDirection } from './hexGrid.ts';

export {
  createGame,
  move,
  moveTo,
  fail,
  remainingMowable,
  type FailReason,
  type GameState,
  type GameStatus,
  type MoveOutcome,
  type MoveResult,
} from './game.ts';

export { levelFromAscii } from './ascii.ts';
