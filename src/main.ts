// Browser entry point (M3; M5 seed sharing; M6 onboarding). Boots the level named
// by the URL hash if one is present (a shared link), else — on a first-ever visit —
// the tutorial lawn (M6), otherwise the deterministic default level (see
// game/defaultLevel). Each win hands out a fresh random level, and the app keeps the
// URL hash in sync so it always names — and can share — the level on screen. Guarded
// so importing this module in a non-DOM (node/test) environment does nothing.

import { mountGame } from './game/app.ts';
import { bootLevel, fitLevelSize, randomLevel, type CodedLevel } from './game/defaultLevel.ts';
import { readLevelCode } from './game/levelUrl.ts';
import { browserStore } from './game/storage.ts';
import { TUTORIAL_COACH_CONFIG, tutorialLevel } from './game/tutorial.ts';

export function bootstrap(container: HTMLElement): void {
  const hash = typeof location !== 'undefined' ? location.hash : '';
  // Size the default and "next" lawns to the screen: portrait phones get a taller
  // lawn, wide screens a wider one, clamped so a desktop never gets a huge level.
  const size =
    typeof window !== 'undefined'
      ? fitLevelSize({ width: window.innerWidth, height: window.innerHeight })
      : undefined;

  const store = browserStore();
  // First-ever visit with no shared link → open the tutorial and remember it, so a
  // reload doesn't force it again. A shared #hash always wins (it may even be
  // #tutorial, which routes through bootLevel to the same lawn, coach included).
  let initial: CodedLevel;
  if (readLevelCode(hash) === undefined && !store.hasSeenTutorial()) {
    initial = tutorialLevel();
    store.markTutorialSeen();
  } else {
    initial = bootLevel(hash, size);
  }

  mountGame(container, initial, {
    nextLevel: (shape) => randomLevel(size, shape),
    store,
    coach: TUTORIAL_COACH_CONFIG,
  });
}

if (typeof document !== 'undefined') {
  const board = document.getElementById('game');
  if (board instanceof HTMLElement) {
    bootstrap(board);
  }
}
