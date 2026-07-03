// Browser entry point (M2). Mounts the playable demo level: canvas board, mower,
// mowed trail, arrow-key input, win/fail states. Guarded so importing this module
// in a non-DOM (node/test) environment does nothing.

import { DEMO_LEVEL_MAP } from './game/demoLevel.ts';
import { mountGame } from './game/app.ts';
import { levelFromAscii } from './model/index.ts';

export function bootstrap(container: HTMLElement): void {
  const level = levelFromAscii(DEMO_LEVEL_MAP);
  mountGame(container, level);
}

if (typeof document !== 'undefined') {
  const board = document.getElementById('game');
  if (board instanceof HTMLElement) {
    bootstrap(board);
  }
}
