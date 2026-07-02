import { defineConfig } from 'vite';

// GitHub Pages serves a project site under /<repo>/, so the build must use that
// base path. Locally (dev/preview) the base is '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/lawnmower/' : '/',
}));
