// Meta UI for M5 seed sharing: a "level code" input to load a shared/pasted level,
// a Share button that copies the current URL (which carries the level's seed — see
// game/levelUrl), and a best-time readout. Kept out of game/app so the app stays
// focused on the model/render/input loop; the app owns the callbacks and feeds this
// the current best time.

import { formatTime } from '../model/index.ts';

export interface ControlsCallbacks {
  /** Load a level from a pasted/typed code (already trimmed, non-empty). */
  onLoadCode(code: string): void;
  /** Move on to a fresh lawn — the on-screen (tap) equivalent of the N key. */
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

  element.append(nextButton, form, best);

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
  };
}
