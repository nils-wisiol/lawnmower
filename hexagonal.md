# Hexagonal Levels — Implementation Plan

> Status: **Finalized, ready to implement.** Scoped against the current codebase
> (post-M6). This is a **large** change, so it is broken into milestones (H0–H5),
> each a shippable, testable slice. It extends the roadmap item in
> `lawnmower.md` §9 ("hexagonal grid world") and resolves the open question in
> §10 ("Hex + swipe input").
>
> Decisions locked in review: flat-top orientation (§2.1); 6-intent input with a
> conflict-free key scheme **plus click/tap-to-move** (§2.2, §2.6); axial coords
> (§2.3); shoreline degrade-then-polish (§2.4); versioned short-form geometry tag
> (§2.5).

---

## 1. Scope assessment — why this is large, but not a rewrite

The v1 architecture was deliberately built to absorb this (`lawnmower.md` §5:
"Square grid and hex grid become two implementations of one interface"). That
investment pays off here — the following need **zero changes**:

- **Core rules** ([src/model/game.ts](src/model/game.ts)) — move validation,
  mow tracking, win/fail all operate on opaque `CellId`s via the `Topology`
  `neighbor` function and `directions` set. Nothing reads square coordinates.
- **Generator** ([src/gen/generator.ts](src/gen/generator.ts)) — the
  self-avoiding walk, obstacle scatter, and water clustering are all written
  against `topology.directions` / `topology.neighbor`. It only needs to be
  _handed_ a hex topology instead of constructing `new SquareGrid` itself.
- **Timing / scoring / session / storage** — geometry-agnostic already.
- **Renderer's graph traversal** — it already asks `topology.layout(cell)` for
  positions and iterates `topology.directions`; it never assumes a square shape
  _structurally_ (though it draws square _cells_ — see below).

What is genuinely coupled to squares and must change:

| Area          | File                                                                                                                               | What's square-specific                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Topology impl | (new) `src/model/hexGrid.ts`                                                                                                       | No hex topology exists yet                                                                                                               |
| Input intents | [src/model/types.ts](src/model/types.ts), [src/input/keyboard.ts](src/input/keyboard.ts), [src/input/swipe.ts](src/input/swipe.ts) | `InputDirection` has only 4 values; hex needs 6                                                                                          |
| Pointer input | [src/game/app.ts](src/game/app.ts), [src/input/swipe.ts](src/input/swipe.ts)                                                       | No click/tap-to-move exists; no pixel→cell hit-test exists                                                                               |
| Cell drawing  | [src/render/canvasRenderer.ts](src/render/canvasRenderer.ts)                                                                       | `fillRect` cells; `bounds`/`fitCellSize` assume rectangular packing; sprites drawn into square boxes; affordance/marker/revisit geometry |
| Shoreline     | [src/render/canvasRenderer.ts](src/render/canvasRenderer.ts), [src/render/gardenSprites.ts](src/render/gardenSprites.ts)           | `WATER_EDGE` bitmask is N/E/S/W (4 sides)                                                                                                |
| Authoring     | [src/model/ascii.ts](src/model/ascii.ts)                                                                                           | Square-only map parser (used heavily by tests)                                                                                           |
| Serialization | [src/gen/shortForm.ts](src/gen/shortForm.ts), [src/gen/generator.ts](src/gen/generator.ts)                                         | No geometry tag; generator hardcodes `SquareGrid`                                                                                        |
| Mower facing  | [src/render/sprite.ts](src/render/sprite.ts) `rotateCW`                                                                            | Derives 4 facings by 90° rotation                                                                                                        |

**Conclusion:** not a rewrite, but it touches the entire render stack, requires a
real input-scheme design decision, and changes the level-code format. Milestones.

---

## 2. Design decisions to resolve (H0 gate)

These are the decisions that shape every later milestone. Recommendations given;
**please confirm or override during review.**

### 2.1 Hex orientation — _recommend: flat-top, offset rows_

A flat-top hex has neighbours **N, S, NE, NW, SE, SW** (no pure E/W). This keeps
the arrow keys' vertical axis intact (Up = N, Down = S) and reads naturally as a
garden laid out in rows. (The alternative, pointy-top, has E/W but no N/S, which
fights the "up = forward" intuition of arrow keys.)

### 2.2 Input scheme — 6 intents; conflict-free keys; click/tap-to-move

`InputDirection` currently is `'up' | 'down' | 'left' | 'right'` (4). Hex needs 6
movement intents. Plan: **widen the abstract intent set to a superset** the
`Topology` maps down — each topology interprets the intents its own way and
ignores the ones it doesn't use (its `directionForInput` returns `undefined`), so
this is backward-compatible by construction and matches the existing
`directionForInput` design. Keyboard/swipe stay **topology-blind** (a key maps to
a fixed intent; the topology decides what that intent means), so the intent set is
the union of everything any geometry needs:

`'up' | 'down' | 'left' | 'right' | 'upLeft' | 'upRight' | 'downLeft' | 'downRight'`

**Gap caught in review:** [src/input/keyboard.ts](src/input/keyboard.ts) already
binds **W/A/S/D → up/left/down/right**, so an earlier "Q/E/A/D for hex" idea would
have overloaded A/D. Avoided by giving the hex diagonals their _own_ keys and
leaving A/D as the square-only left/right:

| Key   | Intent    | Square dir   | Flat-top hex dir |
| ----- | --------- | ------------ | ---------------- |
| ↑ / W | up        | N            | N                |
| ↓ / S | down      | S            | S                |
| ← / A | left      | W            | _(unmapped)_     |
| → / D | right     | E            | _(unmapped)_     |
| Q     | upLeft    | _(unmapped)_ | NW               |
| E     | upRight   | _(unmapped)_ | NE               |
| Z     | downLeft  | _(unmapped)_ | SW               |
| C     | downRight | _(unmapped)_ | SE               |

(Q/E/Z/C form the four-diagonal cluster; W/S give the vertical axis. Square play
is byte-for-byte unchanged — it never sees the new intents.)

**Swipe:** classify the touch vector into **6 sixty-degree sectors** (hex) vs. the
current 4 quadrants (square) — the sector→intent table is chosen per topology's
direction set ([src/input/swipe.ts](src/input/swipe.ts)).

**Click/tap-to-move (new, per review):** in addition to keys/swipe, the player may
**click (desktop) or tap (touch) a neighbouring cell** to move there — one step,
into a legal neighbour only (no multi-step pathfinding, preserving the one-move-
per-input rule, §5). This is a new modality (desktop was keyboard-only) and needs a
pixel→cell hit-test — see §2.6. The move-affordance dots already drawn on legal
neighbours ([canvasRenderer.ts](src/render/canvasRenderer.ts) `legalNeighbors`)
double as the tap targets, so the feature is self-teaching.

This resolves `lawnmower.md` §10 "Hex + swipe input." The 4 new intent names are
the concrete deliverable to lock in at H0.

### 2.3 Coordinate system — _recommend: axial internally, offset for layout_

Use **axial coordinates** `(q, r)` inside `hexGrid.ts` (clean neighbour math),
encoded into the opaque `CellId` (e.g. `"q,r"` — same opaque-string discipline as
`squareGrid.ts`). `layout(cell)` returns fractional pixel positions (rows offset
by half a cell, vertical spacing ×0.75 for flat-top), which the renderer already
consumes generically via `topology.layout`.

### 2.4 Shoreline fidelity — _recommend: graceful degrade first, polish in H4_

The renderer's `waterEdgeMask` already "skips directions the geometry doesn't
name," so hex water bodies **already fall back to the interior tile** — playable
but without banked edges. Treat proper hex shorelines (a 6-bit edge mask + hex
edge sprites) as a **separable polish milestone (H4)** so a playable hex level
ships at H3 without blocking on new art.

### 2.5 Short-form format — _bump generator version + add geometry tag_

Add a geometry field so a code is self-describing, e.g.
`3.hex.12345.10x8.70` (version.shape.seed.WxH.coverage%). Bump
`GENERATOR_VERSION` (currently 2 → 3). **A tag-less (4-part) code decodes as
`square`** (locked in review), so existing v2 square codes in shared links / seed
history keep working. Two constraints make this safe under the "detect, don't
silently reskin" policy, and H5 must honour both:

- **The square generation path must not change** in this work — hex is added as a
  _new_ topology, leaving the square walk/scatter/decor untouched, so a tag-less v2
  code still expands to the identical level under v3.
- **The decoder accepts v2 (implicit square) and v3 (explicit `square`/`hex`) only.**
  A tag-less code is treated as square; an unknown _shape_, or any other version,
  still **fails loudly** — the tag keeps detecting real mismatches.

**Note:** any history/best-time UI decoding stored codes must handle a genuinely
unrecognised/malformed code gracefully (skip it) rather than throw (§4).

### 2.6 Pointer input & hit-testing _(new capability for click/tap-to-move)_

Click/tap-to-move (§2.2) needs the **inverse of `layout`** — a pixel → cell lookup
— which does not exist anywhere today. Design, geometry-clean:

- **Topology gains `cellAt(point: CellPoint): CellId | undefined`** — the inverse of
  `layout`, in cell-units. Square: floor/round to the grid. Hex: point-in-hex via
  axial rounding. Implemented per topology, so hit-testing needs no geometry
  knowledge in the app. (Bonus: this also enables click-to-move on the _square_
  board.)
- **Renderer exposes `cellAtPixel(cssX, cssY)`** — it owns `cellSize`, `origin`, and
  the devicePixelRatio transform, so it converts an event's CSS-pixel position into
  cell-units and delegates to `topology.cellAt`.
- **Core gains `moveTo(state, target: CellId)`** — validates `target` is a current
  neighbour and applies the same trait logic as `move` (refactor: extract the
  "enter this target cell" body of `move` and share it). A click resolves to a cell,
  not an intent, so this is cleaner than reverse-mapping to a direction. Square play
  keeps using `move(input)`; both share the core.
- **Mower facing from the positional delta.** `drawMower` currently derives facing
  from the _input intent_. For a tap-move there is no intent, and hex has 6 headings.
  Unify: compute facing from the `from → to` layout vector (angle → nearest heading),
  which works for every modality and every geometry. This also simplifies H3's hex
  mower facing.

**Tap-vs-restart reconciliation (gap caught in review).** Today a mid-play tap does
_nothing_ on purpose — [app.ts](src/game/app.ts) comments "a stray tap mid-run can't
wipe out progress"; tap only restarts/advances on a _finished_ lawn. Tap-to-move
must preserve that safety. New tap policy:

1. **Playing** + tap on a **legal-neighbour cell** → move there.
2. **Playing** + tap elsewhere (non-neighbour or current cell) → **ignored** (stray
   taps still can't wipe progress).
3. **Won / lost** → restart or next, exactly as today.

This requires `onTap` to receive the **tap coordinates** (it currently fires a bare
callback), and a new desktop `click`/pointer handler doing the same hit-test.

---

## 3. Milestones

Each milestone is independently testable. H1 (topology) makes hex _logically_
playable in tests immediately, because the core and generator are already
abstract — the visible payoff lands at H3.

### H0 — Decisions & spec _(small, gating)_

Lock §2: orientation, the 8-name intent superset + key scheme, swipe sectors,
click/tap-to-move policy (§2.2/§2.6), axial encoding, short-form geometry tag +
version bump policy, and the shoreline degrade-then-polish call. Update
`lawnmower.md` §10 to mark "Hex + swipe input" resolved and record the chosen
scheme. **Done when:** this doc's §2 is confirmed. _(Done — locked in review.)_

### H1 — Hex topology + hit-test/moveTo _(pure logic)_

New `src/model/hexGrid.ts` implementing `Topology`: axial cells over a rectangular
region, 6 `directions`, `neighbor`, `directionForInput` (mapping the new intents),
and fractional `layout`. Add **`cellAt` (inverse of `layout`, §2.6) to the
`Topology` interface** and implement it for both square and hex. Add core
**`moveTo(state, target)`** to [game.ts](src/model/game.ts) by extracting the
shared "enter target cell" body from `move`. Add a `shape` parameter to
`GeneratorConfig` and have `generate()` build the requested topology instead of
hardcoding `SquareGrid`. Export the new pieces from `src/model/index.ts`.
**Done when:** unit tests drive a hardcoded hex level to a win _and_ a fail through
the **unchanged** core; `cellAt`↔`layout` round-trip is tested for both geometries;
`moveTo` accepts a neighbour and rejects a non-neighbour; and the generator
produces a deterministic, solvable hex level for a fixed seed. _(Done — hex walks
are replayed cell-by-cell through `moveTo` rather than `tests/helpers/solve.ts`,
whose input list is square-only; the 6-way key intents that would let `solve.ts`
drive a hex board land in H2.)_

### H2 — Input pipeline: 6-way keys, 6-sector swipe, click/tap-to-move

Widen `InputDirection` in [src/model/types.ts](src/model/types.ts) to the 8-name
superset. Update [src/input/keyboard.ts](src/input/keyboard.ts) (add Q/E/Z/C
diagonals; leave W/A/S/D + arrows as-is) and
[src/input/swipe.ts](src/input/swipe.ts) (6 sectors on hex; pass tap **coordinates**
through `onTap`). Wire **click/tap-to-move** in [app.ts](src/game/app.ts): a new
desktop `click`/pointer handler and the coordinate-carrying `onTap` both hit-test
via `renderer.cellAtPixel` and, when playing, call `moveTo` for a legal neighbour;
otherwise fall back to the existing restart/next behaviour (§2.6 policy). Confirm
`SquareGrid` ignores the new intents.
**Done when:** input unit tests cover the 6-way keyboard, 6-sector swipe, and the
tap-vs-restart branch table; a click/tap on a legal neighbour moves the mower and a
stray mid-play tap is a no-op; **all existing square input/e2e tests still pass**.
_(Done — `InputDirection` widened; a render-only `Facing` type keeps the mower sprite
at four headings; the swipe classifier buckets a gesture into the topology's own intent
set (4 quadrants square / 6 sectors hex) via a canonical-vector dot product; `onTap`
carries coordinates and a desktop `click` handler shares the hit-test; `cellAtPixel`
was brought forward from H3 (its H3 unit-test lands with the renderer-geometry rework —
here it is exercised through the click/tap e2e). `solve.ts` now drives all 8 intents so
it can replay a hex walk.)_

### H3 — Hex rendering _(the big visual slice)_

In [src/render/canvasRenderer.ts](src/render/canvasRenderer.ts):

- draw hexagon cell fills (path + fill) instead of `fillRect`;
- generalise `bounds` / `fitCellSize` for offset-row packing (fractional extents,
  correct on-screen fit for narrow phones);
- add the **`cellAtPixel` hit-test helper** (CSS-px → cell-units → `topology.cellAt`)
  that H2's pointer handlers depend on;
- clip sprites into the hex cell (or accept square sprites centred within — decide
  during the slice) so grass/obstacle/mower art sits inside the hexagon;
- adapt affordance dots, start ring, and revisit highlight to hex centres/outline;
- **facing from the `from→to` layout delta** (§2.6), giving 6 hex headings without
  overloading `rotateCW`'s 4 — a nearest-of-4 sprite fallback is an acceptable
  interim if 6 mower sprites aren't ready.
  **Done when:** a human can play a generated hex level to completion in the browser
  using keys **and** click/tap (Playwright e2e mirroring
  `tests/e2e/playthrough.spec.ts`). _(Done — the renderer is now geometry-blind at the
  cell level too: each `Topology` supplies a `cellPolygon` (unit square / flat-top
  hexagon), and the renderer packs (`boardExtent`), fills, clips sprites, insets the
  gap, and hit-tests from that one outline, so square output is byte-for-byte unchanged
  while hex draws hexagons. Facing already reduces to the nearest of four cardinals from
  the from→to delta (H2), so the mower needs no new art. To make the browser playthrough
  possible before H5, the minimal slice of the short-form geometry tag (§2.5) landed:
  hex encodes/decodes as the 5-part v3 `3.hex.…` code (square stays the 4-part v2 code,
  untouched), so a hex level loads and shares by URL. The rest of H5 — the size/shape
  control, onboarding copy, and the round-trip share e2e — remains.)_

### H4 — Hex shoreline & decor _(polish; separable)_

6-bit hex `WATER_EDGE` + hex water-edge sprites in
[src/render/gardenSprites.ts](src/render/gardenSprites.ts); verify the water
clustering in `assignDecor` (already topology-generic) yields good hex bodies.
Add a hex authoring helper (a hex variant of [src/model/ascii.ts](src/model/ascii.ts))
for readable hand-made hex test fixtures.
**Done when:** generated hex lakes bank onto the lawn with correct edges; hex
fixtures are authorable in tests. _(Shippable without this — see §2.4.)_ _(Done — a
6-bit `HEX_WATER_EDGE` + 64 flat-top hex water tiles bank a grass margin along the six
hexagon edges, computed from the edge normals so a land edge shows shoreline just inside
the outline. The renderer stays geometry-blind: it collects which of a cell's directions
face water and calls the theme's new `waterSprite(directions, waterDirs)`, which routes a
square vocabulary to the untouched 16 square tiles and a hex vocabulary to the hex set —
so square output is byte-for-byte unchanged. `assignDecor` was already topology-generic
(the water-fountain interior test uses `topology.directions.length`), and a generator
test confirms it grows connected hex bodies. `hexLevelFromAscii` reads a plain
rectangular char grid as an odd-q offset hex board for readable hand-made fixtures. The
H4 shoreline-mask units sample the actual banked pixels on both geometries.)_

### H5 — Serialization & UX integration

Short-form geometry tag + `GENERATOR_VERSION` bump
([src/gen/shortForm.ts](src/gen/shortForm.ts)); ensure URL-hash sharing
([src/game/app.ts](src/game/app.ts), [src/game/levelUrl.ts](src/game/levelUrl.ts))
round-trips a hex level; expose a hex option in the level/size controls
([src/game/controls.ts](src/game/controls.ts)); tutorial/onboarding note for the
6-way controls ([src/game/tutorial.ts](src/game/tutorial.ts)).
**Done when:** a shared hex code reproduces the exact level after reload, and an
e2e test loads + plays a hex level end to end. _(Done — the short-form geometry tag +
round-trip landed in H3 and stays untouched here: rather than bump `GENERATOR_VERSION`
(which would have changed every square code), the tag is a separate `SHAPE_TAGGED_VERSION`
= 3 so square codes keep their tag-less v2 form byte-for-byte while hex is the 5-part
`3.hex.…` form. This slice adds the UX: `randomLevel(size, shape)` and the app's
`nextLevel(shape)` thread a geometry choice through, a Square/Hex picker in the controls
drives what "New lawn" generates, and the controls reflect the loaded level's geometry
(read geometry-blind from whether the topology maps the diagonal intents) so a shared hex
link flips the picker and surfaces `HEX_CONTROLS_HINT`, the 6-way onboarding note. URL-hash
sharing was already code-agnostic, so a hex code round-trips through the hash and reproduces
the exact level on reload. Tests: `randomLevel` hex-code/geometry units, and an e2e that
opts a new lawn into hex (asserting the `3.hex.…` hash + the note) and reloads a shared hex
link to the identical board — alongside H3's hex playthrough that plays a hex level to a win
end to end.)_

---

## 4. Risks, gaps, & open points

Gaps surfaced during review (now folded into the milestones above):

- **Key conflict (resolved).** W/A/S/D are already bound to up/left/down/right, so
  the hex diagonals take their own keys (Q/E/Z/C), not A/D — §2.2.
- **Tap already means restart (resolved).** Tap-to-move preserves the "stray mid-run
  tap can't wipe progress" rule via the branch table in §2.6; `onTap` must start
  carrying coordinates.
- **No pixel→cell inverse exists (resolved).** Added as `Topology.cellAt` +
  `renderer.cellAtPixel` (H1/H3) — a prerequisite for click/tap-to-move.
- **No `move`-by-cell exists (resolved).** Added core `moveTo(state, target)` (H1).
- **Old-code compatibility (resolved).** Tag-less v2 codes decode as `square` and
  keep resolving to the identical level, on the constraint that the square
  generation path is left untouched; the tag still fails loudly on a real mismatch
  — §2.5, H5.
- **Stored codes must not crash the UI (resolved).** History/best-time UI skips a
  code that genuinely fails to decode rather than throwing — §2.5, H5.

Remaining open points / risks:

- **Input discoverability.** Six directions are less obvious than four arrows; the
  tutorial (H5) must teach them, and mobile relies on both 6-sector swipe accuracy
  near sector boundaries and tap-to-move — worth a Playwright check.
- **Sprite-in-hex aesthetics.** Square pixel-art sprites clipped to a hexagon may
  look cropped; may need hex-shaped base tiles. A design choice inside H3.
- **Generator coverage on hex.** The Warnsdorff walk should behave on 6-degree
  graphs, but the coverage floor / `MAX_ATTEMPTS` tuning may need revisiting for hex
  connectivity — verify with the deterministic generator test at H1.
- **Hex tutorial/default.** Square stays the default geometry (default level, demo,
  tutorial unchanged); a dedicated hex onboarding step is an H5 sub-task, not a new
  default.

## 5. Testing strategy

Follow the existing policy (`lawnmower.md` §8: unit + e2e, every fix ships a
regression test):

- **H1:** deterministic generator test + core win/fail on a hardcoded hex map;
  `cellAt`↔`layout` round-trip (both geometries); `moveTo` neighbour/non-neighbour.
- **H2:** keyboard/swipe mapping units; tap-vs-restart branch table; a stray
  mid-play tap is a no-op; square-input regression guard.
- **H3:** renderer geometry units (hex `bounds`/fit, cell centres, `cellAtPixel`)
  without a real canvas, plus a Playwright hex playthrough using keys and click/tap.
- **H4:** shoreline-mask units on hex fixtures.
- **H5:** short-form hex round-trip unit + URL-share e2e.
