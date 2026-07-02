// M0 scaffold entry point. Real game bootstrapping arrives in M2 (render + input).
// For now this just proves the module graph builds and the page mounts.

export function greeting(): string {
  return 'Lawnmower — coming soon.';
}

// Guarded so the module is importable in a non-DOM (node/test) environment.
if (typeof document !== 'undefined') {
  const app = document.getElementById('app');
  if (app) {
    // eslint-disable-next-line no-console
    console.log(greeting());
  }
}
