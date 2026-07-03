# Lawnmower

Mow every tile of a garden exactly once, routing around obstacles. A browser
puzzle game about efficient coverage.

See [lawnmower.md](lawnmower.md) for the full design & implementation plan.

## Status

**M2 — Playable render + input.** A hardcoded level is playable in the browser:
canvas rendering (through a swappable theme layer), arrow-key/WASD input, a
visible mower, mowed trail, start marker, and win/fail states with instant
restart (`R`). Built on the M1 pure trait-based model. The seeded generator,
scoring/timing, persistence, and art polish land in later milestones (see the
roadmap in §9 of the plan).

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
