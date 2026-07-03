// URL-as-share-link for the current level (M5). The level's short-form code lives
// in the URL *hash* (e.g. #1.20260703.12x9.70), so copying the page URL shares the
// exact level. The hash is rewritten every time a level loads — via
// history.replaceState, so it never spams the back button — keeping the URL always
// current to what the player sees (lawnmower.md §9 M5, "enter/share a seed").
//
// A hash (not a query string) keeps this purely client-side: GitHub Pages serves
// the same static page regardless, and the fragment never reaches the server.
//
// Split into pure parse/build helpers (unit-testable without a DOM) and a thin
// history-writing wrapper (the only DOM-touching part).

/**
 * Read a level code out of a location hash string. Accepts the raw `location.hash`
 * (with a leading '#') or a bare code; returns undefined for an empty/absent hash.
 */
export function readLevelCode(hash: string): string | undefined {
  const code = (hash.startsWith('#') ? hash.slice(1) : hash).trim();
  return code.length > 0 ? code : undefined;
}

/** Build the hash fragment (including the leading '#') that carries a level code. */
export function levelHash(code: string): string {
  return `#${code}`;
}

/** The slice of the History API we depend on — injectable with a fake in tests. */
export interface HistoryLike {
  replaceState(data: unknown, unused: string, url: string): void;
}

/**
 * Rewrite the URL hash to carry `code`. Uses replaceState (not a hash assignment or
 * pushState) so loading level after level doesn't pile up back-button history.
 */
export function syncLevelHash(history: HistoryLike, code: string): void {
  history.replaceState(null, '', levelHash(code));
}
