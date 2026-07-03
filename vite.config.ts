import { defineConfig } from 'vite';

// GitHub Pages serves a project site under /<repo>/, so the build must use that
// base path. `vite preview` serves the built output and therefore must use the
// SAME base as the build (otherwise the baked-in /lawnmower/ asset URLs 404) — the
// e2e suite runs against preview. Only the dev server ('serve', not preview) uses
// '/'.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/lawnmower/' : '/',
}));
