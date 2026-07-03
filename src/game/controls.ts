// Meta UI for M5 seed sharing: a "level code" input to load a shared/pasted level,
// a Share button that copies the current URL (which carries the level's seed — see
// game/levelUrl), and a best-time readout. Kept out of game/app so the app stays
// focused on the model/render/input loop; the app owns the callbacks and feeds this
// the current best time.

import { formatTime } from '../model/index.ts';
import type { GridShape } from '../gen/index.ts';
import { HEX_CONTROLS_HINT } from './tutorial.ts';

export interface ControlsCallbacks {
  /** Load a level from a pasted/typed code (already trimmed, non-empty). */
  onLoadCode(code: string): void;
  /**
   * Move on to a fresh lawn — the on-screen (tap) equivalent of the N key. The app
   * reads the selected geometry via `Controls.shape()` when generating it.
   */
  onNext(): void;
  /** The URL to copy when Share is pressed (carries the current level's code). */
  shareUrl(): string;
}

export interface Controls {
  /** The controls root, for the app to append under the board. */
  readonly element: HTMLElement;
  /** Update the best-time readout for the current level (undefined → no record yet). */
  setBestTime(ms: number | undefined): void;
  /** Reflect the current level's code in the input (so it reads as the shareable code). */
  setCode(code: string | undefined): void;
  /** The geometry the player has selected for the next generated lawn (hexagonal.md H5). */
  shape(): GridShape;
  /**
   * Reflect the loaded level's geometry in the shape picker (so the picker always
   * shows what is on screen) and surface/hide the 6-way controls hint accordingly.
   */
  setShape(shape: GridShape): void;
}

/** Copy text to the clipboard, resolving false if no clipboard API is available. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Build the seed-sharing controls; wiring is done by the caller via `callbacks`. */
export function createControls(callbacks: ControlsCallbacks): Controls {
  const element = document.createElement('div');
  element.className = 'controls';

  // Tap target for "next lawn": on a phone there is no N key, so this is the
  // primary way to skip to / continue with a fresh lawn.
  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'new-lawn';
  nextButton.textContent = 'New lawn';
  nextButton.addEventListener('click', () => callbacks.onNext());

  // Geometry picker for the next generated lawn (hexagonal.md H5). Sits next to "New
  // lawn" since it decides what that button hands out; square is the default so the
  // familiar four-arrow game is unchanged until the player opts into hex.
  const shapeLabel = document.createElement('label');
  shapeLabel.className = 'shape-label';
  shapeLabel.append('Shape');
  const shapeSelect = document.createElement('select');
  shapeSelect.className = 'shape-select';
  shapeSelect.setAttribute('aria-label', 'Board shape for a new lawn');
  for (const [value, text] of [
    ['square', 'Square'],
    ['hex', 'Hex'],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    shapeSelect.append(option);
  }
  shapeLabel.append(shapeSelect);

  const newLawnRow = document.createElement('div');
  newLawnRow.className = 'new-lawn-row';
  newLawnRow.append(nextButton, shapeLabel);

  // The 6-way controls onboarding note (hexagonal.md §4). Shown only while a hex board
  // is selected/loaded — square play never sees it, keeping the default uncluttered.
  const controlsHint = document.createElement('p');
  controlsHint.className = 'controls-hint';
  const currentShape = (): GridShape => (shapeSelect.value === 'hex' ? 'hex' : 'square');
  const syncShapeHint = (): void => {
    const hex = currentShape() === 'hex';
    controlsHint.textContent = hex ? HEX_CONTROLS_HINT : '';
    controlsHint.hidden = !hex;
  };
  shapeSelect.addEventListener('change', syncShapeHint);
  syncShapeHint();

  const form = document.createElement('form');
  form.className = 'seed-form';

  // Visible label wraps the input so the field reads unambiguously as a "level
  // code" (rather than relying on placeholder text alone).
  const label = document.createElement('label');
  label.className = 'seed-label';
  label.append('Level code');

  const input = document.createElement('input');
  input.className = 'seed-input';
  input.type = 'text';
  input.name = 'code';
  input.placeholder = 'e.g. 1.12345.12x9.70';
  input.setAttribute('aria-label', 'Level code');
  input.spellcheck = false;
  input.autocomplete = 'off';
  label.append(input);

  const loadButton = document.createElement('button');
  loadButton.type = 'submit';
  loadButton.className = 'seed-load';
  loadButton.textContent = 'Load';

  const shareButton = document.createElement('button');
  shareButton.type = 'button';
  shareButton.className = 'seed-share';
  shareButton.textContent = 'Share';

  form.append(label, loadButton, shareButton);

  const best = document.createElement('p');
  best.className = 'best-time';

  element.append(newLawnRow, controlsHint, form, best);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const code = input.value.trim();
    if (code.length > 0) callbacks.onLoadCode(code);
  });

  let shareResetTimer: ReturnType<typeof setTimeout> | undefined;
  shareButton.addEventListener('click', () => {
    void copyToClipboard(callbacks.shareUrl()).then((ok) => {
      shareButton.textContent = ok ? 'Copied!' : 'Copy failed';
      if (shareResetTimer !== undefined) clearTimeout(shareResetTimer);
      shareResetTimer = setTimeout(() => {
        shareButton.textContent = 'Share';
      }, 1500);
    });
  });

  return {
    element,
    setBestTime(ms: number | undefined): void {
      best.textContent = ms === undefined ? 'No best time yet' : `Best: ${formatTime(ms)}`;
    },
    setCode(code: string | undefined): void {
      // Don't clobber whatever the player is mid-typing; only reflect the loaded
      // level's code when the field isn't focused.
      if (document.activeElement !== input) input.value = code ?? '';
    },
    shape(): GridShape {
      return currentShape();
    },
    setShape(shape: GridShape): void {
      if (shapeSelect.value !== shape) shapeSelect.value = shape;
      syncShapeHint();
    },
  };
}
