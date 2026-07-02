# Lawnmower

Mow every tile of a garden exactly once, routing around obstacles. A browser
puzzle game about efficient coverage.

See [lawnmower.md](lawnmower.md) for the full design & implementation plan.

## Status

**M0 — Project scaffold.** Vite + TypeScript, ESLint/Prettier, Vitest +
Playwright, and a GitHub Pages CI deploy. The game itself lands in later
milestones (see the roadmap in §9 of the plan).

## Development

Requires Node.js 18+.

```bash
npm install          # install dependencies
npm run dev          # start the Vite dev server
npm run build        # type-check + production build to dist/
npm run preview      # serve the production build locally
```

## Testing

```bash
npm test             # unit tests (Vitest)
npm run test:e2e     # end-to-end tests (Playwright)
npm run lint         # ESLint
npm run format       # apply Prettier formatting
```

## Deployment

Pushing to `main` runs the CI workflow (lint, tests, build) and deploys the
static build to GitHub Pages.
