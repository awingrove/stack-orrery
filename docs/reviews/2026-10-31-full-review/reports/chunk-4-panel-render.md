# Chunk 4 — Panel render — Review Report

- **Reviewer:** Qwen3.7 Plus
- **Date:** 2026-10-31
- **Files reviewed:** `js/panel/render.js` (262), `render-stage.js` (141), `layout.js` (287),
  `layout-stage6.js` (72), `layout-geo.js` (40), `orrery-svg.js` (42), `hop-targets.js` (197),
  `camera.js` (101), `viewport.js` (300) — 1,442 total.
- **Cross-referenced:** `test/panel/render.test.js`, `test/panel/camera.test.js`,
  `test/panel/layout-stage6.test.js`, `e2e/orrery-plane.spec.js`, `e2e/camera-drawer.spec.js`,
  `e2e/panel-stage6.spec.js`, `DESIGN.md`, `AGENTS.md`.
- **Brief-vs-code verification:** all five principal brief claims checked (a–e).
  Confirmed (a) geometry is polar math with only `capDx:-175` and bound margins
  hand-pinned; (b) renderer passes through `snapshot.lastFrame` verbatim; (c) the
  hop-targets.js header unit-pin claim is **false** — no unit test imports it
  (brief was correct to flag it); (d) viewport.js is exactly 300 lines;
  (e) `LANE_WIRES` in viewport.js ↔ `makeWire` calls in layout.js/layout-stage6.js
  must stay wire-id-synced.

## Findings

```yaml
- id: 4-01
  title: hop-targets.js header claims unit-test pins that do not exist
  severity: High
  category: test-contract
  files: [js/panel/hop-targets.js:4-6]
  evidence: >
    Module header reads "unit-pinned shapes in test/panel/render.test.js and
    model-stage6.test.js" (hop-targets.js:5-6). grep across test/panel/ for
    `activeHopTarget` and `hop-targets` returns zero matches — neither
    render.test.js (which pins the journey-log ordering from model.js, not
    hop-targets) nor model-stage6.test.js (which pins DNS labels and
    inspector state) imports this module. The hop→(card, lane) mapping is
    exercised only indirectly through e2e CSS selectors
    (`#node-dns.active-hop`, `#packet-req-dns.lane-active` —
    e2e/panel-stage6.spec.js:83-90).
  impact: >
    A future refactor of the per-stage owner/lane matrices can silently
    mis-route highlights without a unit-test failure — the e2e net catches
    only the specific stage-6 DNS/CDN paths it explicitly navigates.
    The header's guarantee-vocabulary (`PINS:`/`CHECKS:`) becomes noise
    for any maintainer scanning the file for the test contract.
  recommendation: >
    Either (a) add a test/panel/hop-targets.test.js that drives
    activeHopTarget with synthetic snapshots per stage and asserts the
    returned card/lane ids (the module is a pure function, trivially
    unit-testable), or (b) correct the header to state the actual pinning
    contract ("exercised through e2e/panel-stage6.spec.js active-hop /
    lane-active selectors"). Option (a) is strongly preferred — it pins
    the stage-1..5 matrices that no e2e currently touches.
  deep_dive: no

- id: 4-02
  title: render-stage.js writes world-space left/top for compact browsers, crossing DL-1 boundary
  severity: Medium
  category: architecture
  files: [js/panel/render-stage.js:129-130, js/panel/viewport.js:140-145, DESIGN.md:489-491]
  evidence: >
    render-stage.js:129-130 inside renderRingBrowsers sets
    `button.style.left = ${slot.x}px; button.style.top = ${slot.y}px`
    on freshly-created .browser-compact nodes. DESIGN.md:489-491 (DL-1):
    "Keep world-space (left, top) coordinate writes under
    js/panel/viewport.js (positionParts) so every element on an orbital
    ring moves in lockstep when layout geometry changes." viewport.js:140-145
    re-positions the same buttons from `layout.browserSlots` on every
    positionParts() call — the two writes source the same data and agree
    today, but the boundary rule names viewport.js as the single writer.
  impact: >
    A future editor removing viewport.js:140-145 (reading it as redundant
    with render-stage.js's own write) would silently break the DL-1
    single-writer invariant; ring-gap slider changes would stop moving
    the compact nodes. A one-tick flash is also possible between
    renderRingBrowsers's replaceChildren and the next positionParts call.
  recommendation: >
    Let renderRingBrowsers create the buttons without style.left/top (or
    with `left:0; top:0`), and let positionParts own every world-space
    write including the first. Document this split in a comment at
    render-stage.js:114.
  deep_dive: no

- id: 4-03
  title: Two-table wire-id name-sync between LANE_WIRES and makeWire with no automated check
  severity: Medium
  category: DRY
  files: [js/panel/viewport.js:37-63, js/panel/layout.js:123-257, js/panel/layout-stage6.js:62-66]
  evidence: >
    viewport.js LANE_WIRES maps lane DOM ids to wire ids per stage
    (e.g. `'wire-dns': 'wire-browser-dns'` at viewport.js:59,
    `'wire-router': 'wire-network-router'` at viewport.js:60). Those wire
    ids must match the string literals in layout.js's makeWire calls
    (layout.js:124, 131, 164, …) and layout-stage6.js:63-65. A rename in
    layout-stage6.js without the matching viewport.js entry silently
    leaves the lane at (0, 0) — positionParts's `if (lane && wire)` guard
    at viewport.js:130 skips missing wires without complaint.
  impact: >
    The stage-6 wire ids were added in Stage 6a/6b; adding Stage 7
    wires will require updating both files. The silent-skip guard means
    the defect surfaces as a visually misplaced lane, not a crash, and
    the unit suite does not pin wire-id parity (camera.test.js pins
    wire ids in the layout.wires array but not against LANE_WIRES).
  recommendation: >
    Export a single `WIRE_IDS` constant (or a per-stage wire-id set)
    from layout.js and have viewport.js import it; a small unit test
    then asserts `Object.values(LANE_WIRES[s]).flat()` is a subset of
    `layout.wires.map(w => w.id)` for every stage. Alternatively, add
    an `expect` in camera.test.js / layout-stage6.test.js that pins the
    wire ids used by LANE_WIRES for each stage.
  deep_dive: no

- id: 4-04
  title: hop-targets.js duplicates five near-identical per-stage owner/lane matrices
  severity: Medium
  category: DRY
  files: [js/panel/hop-targets.js:15-197]
  evidence: >
    The module has one function per stage shape — `stage5HopTarget`
    (lines 15-62 with async-job and non-async variants), an inline
    stage-4 block (lines 125-148), stage-3 (149-168), stage-2 (170-188),
    and stage-1 (189-196) — each a literal `{ 1: cardId, 2: cardId, ... }`
    table. Stage 3 vs stage 4 vs stage 5 non-async differ only in the
    insertion of `node-cache` (stage 3) / `node-db` (stage 4) / the async
    branch (stage 5); stage 2 is a strict subset of stage 3 without the
    cache row.
  impact: >
    A new stage-7 hop table means another 20-line block copy-pasted from
    stage 5 with the same card-id vocabulary. Typos in one matrix (wrong
    lane id, missing hop number) are caught only by the e2e that happens
    to navigate that stage.
  recommendation: >
    Factor the shared stage-2..5 matrix into one table with per-stage
    "insertions" keyed by hop index (e.g. `stage 3 inserts hop 4 as
    node-cache / packet-req-cache`); or a single function that returns
    owners/lanes given a stage-shaped spec. This collapses ~180 lines
    into ~60.
  deep_dive: yes

- id: 4-05
  title: Stage 7 extension requires layout.js nested-conditional refactor, not just a new external module
  severity: Medium
  category: architecture
  files: [js/panel/layout.js:139-259, js/panel/layout-stage6.js:35-71]
  evidence: >
    Stages 2-5 share one `else` branch (layout.js:139) with nested
    `if (stage >= 3)`, `if (stage >= 4)`, `if (stage >= 5)` conditionals
    (layout.js:193, 220, 231). Stage 6 was cleanly externalized to
    layout-stage6.js and is merged at layout.js:264-272. But adding
    stage 7 requires: (1) a new `7: STAGE7_RINGS` in STAGE_RINGS,
    (2) bumping the `if (stage < 1 || stage > 6)` guard at layout.js:73,
    (3) choosing whether stage 7 extends the stage-2..5 nested branch
    (growing it further) or gets its own external module (and then
    where does stage-6's extras land relative to stage-7's).
  impact: >
    The current stage-6 pattern (external module + merge point) is
    repeatable, but the existing stage-2..5 nested conditional is NOT
    — it would grow another layer if stage 7 reuses any stage-5 nodes.
    The refactor cost is asymmetric: stage 6 paid it once, but the
    nested branch remains the debt.
  recommendation: >
    Document the stage-7 extension runbook now in a comment at
    layout.js:139 — name the pattern (external module + merge at
    layout.js:264) and the boundary contract (extras returns
    `{nodes, wires, boundY}`). Consider extracting the stage-2..5
    accumulation into a `buildCoreChain(stage, rings, gap)` helper
    when stage 7 is planned, so both the legacy branch and any new
    stage call the same builder.
  deep_dive: no

- id: 4-06
  title: viewport.js at exactly 300 lines — the guard-file-size production gate
  severity: Medium
  category: process
  files: [js/panel/viewport.js:1-300]
  evidence: >
    wc -l reports 300. scripts/guard-file-size.mjs gates production
    modules at 300 lines (AGENTS.md "File size"). Any addition — a new
    slider, a new interaction listener, a seventh stage's wiring —
    busts the cap and fails `npm run verify`.
  impact: >
    The file is already doing camera ownership + world positioning +
    SVG draw + all five interaction listeners (buttons, drag, wheel,
    keyboard, two sliders) + syncLayout + auto-refit. Feature pressure
    is real.
  recommendation: >
    Pre-split the interaction listeners into a viewport-input.js (or
    viewport-keys.js / viewport-wheel.js) before the next feature
    slice lands, following the same responsibility-split pattern as
    render.js → render-stage.js. Document the split candidate in a
    comment at viewport.js:177.
  deep_dive: no

- id: 4-07
  title: Duplicate default empty-state strings across render.js and model.js
  severity: Low
  category: DRY
  files: [js/panel/render.js:206, js/panel/model.js:246]
  evidence: >
    `'Send a request or step a hop to render a response.'` appears at
    render.js:206 (fallback when no display) and model.js:246
    (networkLastFrame default inside describeSnapshot). Same string,
    two sources.
  impact: >
    A future copy change must land in two places; if one drifts, the
    UI shows inconsistent empty-state copy.
  recommendation: >
    Define the string once (e.g. a constant in model.js exported next
    to describeSnapshot) and import it in render.js.
  deep_dive: no

- id: 4-08
  title: camera default x = -360 is a magic number with no documented derivation
  severity: Low
  category: readability
  files: [js/panel/camera.js:17]
  evidence: >
    `createCamera({ x = -360, y = 0, zoom = 0.78 } = {})` — the
    default x and zoom are passed through from callers; the values
    look hand-tuned for the stage-1 view but carry no comment
    explaining the framing intent.
  impact: >
    A maintainer adjusting the default camera framing for a new stage
    has no pointer to why -360 / 0.78 was chosen.
  recommendation: >
    Add a one-line comment: "Default frames Stage 1's 3-ring world
    inside a ~960x440 viewport with the Compute ring left-of-center."
  deep_dive: no

- id: 4-09
  title: viewSize() silent fallback to 960x440 when viewport is hidden or zero-width
  severity: Low
  category: logic
  files: [js/panel/viewport.js:108-111]
  evidence: >
    `viewSize = () => ({ w: viewportEl.clientWidth || 960, h:
    viewportEl.clientHeight || 440 })` — if the viewport has
    display:none or zero width at syncLayout time, fitCameraToBounds
    computes from the phantom 960x440 and the resulting zoom/center
    will be wrong the moment the viewport becomes visible.
  impact: >
    Unlikely in production (the panel is always visible when the
    app runs), but the silent fallback hides the defect.
  recommendation: >
    Throw or log a warning if clientWidth/clientHeight is zero at
    syncLayout time, or defer syncLayout until the viewport is
    observed via ResizeObserver.
  deep_dive: no

- id: 4-10
  title: Pipeline cohesion — panel.js → render.js → render-stage.js → hop-targets is clean
  severity: Praise
  category: architecture
  files: [js/panel/render.js, js/panel/render-stage.js, js/panel/hop-targets.js]
  evidence: >
    render.js owns snapshot→DOM translation; render-stage.js owns
    stage-shape DOM writes and imports only activeHopTarget from
    hop-targets.js; hop-targets.js is pure (snapshots in, ids out).
    Zero engine knowledge leaks downward; zero DOM knowledge leaks
    into hop-targets.js.
  impact: Positive — each module is independently readable and testable.
  recommendation: Keep the layering; use it as the model for any
    future render-stage splits.
  deep_dive: no

- id: 4-11
  title: Camera math soundness — transform chain, zoom-at-cursor, auto-refit are unit-pinned
  severity: Praise
  category: logic
  files: [js/panel/camera.js, test/panel/camera.test.js]
  evidence: >
    formatWorldTransform (camera.js:97-101) maps world (wx, wy) to
    screen via `translate(w/2 - cam.x*zoom, h/2 - cam.y*zoom) scale(z)`;
    zoomCameraAt (camera.js:39-48) keeps the world point under the
    cursor fixed while the scale changes; createAutoRefit is an
    armed/cancelled machine with a named counter-example pinned in
    camera.test.js:78-107 ("after a manual btn-zoom-in, the next
    silent tick must NOT refit"). camera.test.js pins WORLD_BOUNDS,
    MIN/MAX_ZOOM, fit arithmetic, and the zoom-at-cursor invariant
    with toBeCloseTo(..., 6).
  impact: >
    The camera is the most math-dense module in the repo and the
    most likely to regress silently; the unit net here is
    proportionally strong.
  recommendation: Carry forward.
  deep_dive: no

- id: 4-12
  title: DESIGN.md DL-1 conformance — positionParts is the world-position authority
  severity: Praise
  category: architecture
  files: [js/panel/viewport.js:120-147]
  evidence: >
    positionParts iterates layout.nodes, LANE_WIRES (with t-fraction
    interpolation via at(a,b,t)), LANES_BETWEEN (with capTo/capDx for
    the servers-cache lane), and browserSlots — every world-space
    coordinate flows from layout → positionParts → style.left/top.
    setWorldPos is the sole writer helper.
  impact: >
    Ring-gap slider changes rescale every element in lockstep
    (verified by e2e/orrery-plane.spec.js:70-79 — the compact browser
    node's style.left changes when the slider moves).
  recommendation: >
    Close the small DL-1 gap named in 4-02 so the invariant is
    total.
  deep_dive: no

- id: 4-13
  title: Geometry is programmatic polar math, not coordinate tables
  severity: Praise
  category: architecture
  files: [js/panel/layout-geo.js:6-9, js/panel/layout.js:60-61, js/panel/layout-stage6.js:36-38]
  evidence: >
    polarToWorld (layout-geo.js:6-9) is pure `Math.cos/sin`; ring
    radii are derived `r_k = (k+1) * gap` (layout.js:61); stage-6
    extras extrapolate `networkRadius = 6 * gap; dnsRadius = 7 * gap;
    cdnRadius = 8 * gap` (layout-stage6.js:36-38). The only
    hand-pinned world numbers are the capDx:-175 margin and the
    bounds padding 180 — both documented inline.
  impact: >
    Adding a ring or changing ringGap rescales the entire geometry
    consistently; no coordinate table to keep in sync.
  recommendation: Carry forward.
  deep_dive: no

- id: 4-14
  title: Trace text passes through sim records verbatim — renderer never mints prose
  severity: Praise
  category: logic
  files: [js/panel/render.js:197-200, js/panel/model.js:236-247, js/sim/engine.js:190-215]
  evidence: >
    render.js:200 sets `els.lastFrame.textContent =
    labels.networkLastFrame`; model.js:247 passes through
    `snapshot.lastFrame ?? 'No frames routed yet'`; engine.js:190
    mints lastFrame from the real lastExchange record; trace.js:91
    and trace-helpers.js mint hop frames from actual component
    messages (lbEnqueuedFrame, dbHopFrame, workerTailFrame, etc.).
    Journey-log entries (panel.js:174) are `snapshot.lastFrame`
    verbatim with a generated label prefix.
  impact: >
    The DL-1/DL-3 contract — UI narratives never invent status or
    hop text the sim did not record — is mechanically enforced by
    the data flow, not by discipline alone.
  recommendation: Carry forward; the compare-tray contract
    (model.js:134-140) extends the same guarantee to diff display.
  deep_dive: no
```

## Brief-vs-code mismatches

The researcher brief was accurate on all five principal claims. The one
item where the brief's fact-checking caught a real defect is claim (c):
the hop-targets.js header claim of unit pins in render.test.js and
model-stage6.test.js is **not supported** by any import in either file.
This is recorded as finding 4-01. No other brief-vs-code mismatches
were found.

## Deep-dive requests (orchestrator dispatch)

One item was flagged `deep_dive: yes` for escalation to
`opencode-go/gemini-4-argon`:

**Item 4-04 — hop-targets.js stage-matrix duplication:**

> Prompt for the deeper model: js/panel/hop-targets.js (197 lines)
> contains five near-identical per-stage owner/lane matrix literals
> (stage 1 at lines 189-196, stage 2 at 170-188, stage 3 at 149-168,
> stage 4 at 125-148, stage 5 at 15-62 with async-job branching, plus
> cdnHopTarget at 69-102). The task is a pure-function mapping from
> (snapshot, hop) to {cardId, laneId}. Please judge: (a) is the
> current literal-table approach the right trade-off for a
> teaching-code repo where readability of each stage's hop sequence
> matters more than DRY purity, or should it be refactored into a
> single parameterized builder? (b) if refactored, sketch the
> minimum-shape spec (per-stage insertions keyed by hop index, or
> a shared stage-2..5 base with overrides) and estimate the line
> reduction. (c) is the stage-6 re-use of stage-5 via `hop - 2`
> (hop-targets.js:120) a load-bearing invariant that the refactor
> must preserve verbatim, or can it be absorbed into the builder?
> Return a verdict (refactor / keep / refactor-minimally) with the
> rationale.

### Deep-dive 4-04 verdict (dispatched by orchestrator, `opencode-go/gemini-4-argon`)

**VERDICT: `refactor-minimally`**

1. **Keep explicit per-stage hop sequences (do not build a cross-stage splice/insertion builder).** Stages 1–5 are not pure additive insertions: Stage 2→3 swaps the backend lane (`packet-res-lb` → `packet-res-cache`), Stage 4→5 drops `node-cache` at hop 4 in favor of `node-db`/`node-queue`, inserts a return `node-network` at hop 6, and appends `node-worker` at hop 8. Hiding stage-specific teaching differences behind array-splice index arithmetic violates AGENTS.md's readable conceptual model goal.
2. **Eliminate parallel `owners`/`lanes` dictionaries and full-table ternary duplication.** Splitting each hop across two parallel objects 10–25 lines apart prevents a reader from seeing a hop's `(cardId, laneId)` pair in one place.
3. In `stage5HopTarget` and `cdnHopTarget`, ternary-duplicating full 8-hop literals when only hops 4/5/8 (Stage 5) or 5..8 (CDN) differ adds ~60 lines of boilerplate and hides the exact branch delta.
4. Hoisting `backendCard`/`dbLane` once into `activeHopTarget` and expressing each stage as a `hop -> [cardId, laneId]` tuple table keeps each stage's story self-contained while cutting the file roughly in half.

**Minimum-shape spec:** each stage map becomes one indexed table of `[cardId, laneId]` tuples with a tiny `pick(table, hop, fallback)` helper; `backendCard`/`dbLane` hoisted once. Estimated reduction: ~197 → ~105–115 lines (~85–90 saved, ~45%) while making each hop's pairing visible on a single line.

**Invariants to preserve (answer to (c)):**

- The stage-6 → stage-5 `hop - 2` delegation (`stage5HopTarget(snapshot, hop - 2)`, hop-targets.js:120) is a load-bearing domain invariant, not accidental reuse: a hosted non-CDN stage-6 request is the 2-hop DNS prelude (1: dns query / 2: dns response) followed by the full stage-5 chain shifted +2. Preserve verbatim.
- Fallback semantics per path: stage-6 hosted non-CDN `hop <= 2` continues to return `{ undefined, undefined }` (no highlight before the DNS query); `hop > 2` and all other paths fall back to `{ 'node-browser', 'packet-req-left' }` out of range. Stage-5 asyncJob hop 5 stays hardcoded `'node-webserver'` (sync hop 5 uses `backendCard`).
