// Browser entry point (M3). Mounts a generated, solvable-by-construction level
// (see game/defaultLevel): canvas board, mower, mowed trail, arrow-key input,
// win/fail states. Guarded so importing this module in a non-DOM (node/test)
// environment does nothing.

import { mountGame } from './game/app.ts';
import { defaultLevel } from './game/defaultLevel.ts';

export function bootstrap(container: HTMLElement): void {
  mountGame(container, defaultLevel());
}

if (typeof document !== 'undefined') {
  const board = document.getElementById('game');
  if (board instanceof HTMLElement) {
    bootstrap(board);
  }
}
