// Browser entry point (M3; M5 seed sharing). Boots the level named by the URL hash
// if one is present (a shared link), otherwise the deterministic default level (see
// game/defaultLevel). Each win hands out a fresh random level, and the app keeps the
// URL hash in sync so it always names — and can share — the level on screen. Guarded
// so importing this module in a non-DOM (node/test) environment does nothing.

import { mountGame } from './game/app.ts';
import { bootLevel, fitLevelSize, randomLevel } from './game/defaultLevel.ts';

export function bootstrap(container: HTMLElement): void {
  const hash = typeof location !== 'undefined' ? location.hash : '';
  // Size the default and "next" lawns to the screen: portrait phones get a taller
  // lawn, wide screens a wider one, clamped so a desktop never gets a huge level.
  const size =
    typeof window !== 'undefined'
      ? fitLevelSize({ width: window.innerWidth, height: window.innerHeight })
      : undefined;
  mountGame(container, bootLevel(hash, size), { nextLevel: () => randomLevel(size) });
}

if (typeof document !== 'undefined') {
  const board = document.getElementById('game');
  if (board instanceof HTMLElement) {
    bootstrap(board);
  }
}
