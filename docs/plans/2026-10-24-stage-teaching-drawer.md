# Stage teaching drawer — per-stage "teaches / try / watch-for" narrative layer

**For agentic workers:** read `AGENTS.md`, `FACTORY.md`, and `DESIGN.md` first.
Execute mechanically from Step 2 and keep `npm run verify` green at every commit.

## Hard rules

- **NEVER** weaken a guardrail, test assertion, threshold, or manifest rule. Stage 1 remains default on `/panel.html` load.
- **Zero runtime dependencies.** Vanilla ESM only; no inline handlers/styles (CSP).
- **Determinism.** `js/sim/**` never calls `Math.random()` or `Date.now()`.
- **Claim vocabulary.** Strict `CHECKS:`, `PINS:`, or `DOCUMENTS:` tags only.
- **File size.** Modules ≤ 300 lines, tests ≤ 450 lines, HTML ≤ 550 lines.
- **Same-change manifests.** Update `slices.yaml` and `storymap.yaml` in the same commit.
- `DESIGN.md` gains a "Teaching drawer" component section in the same commit
  (new UI zone introduced here, per kit DESIGN rule).

## Negative-case contracts (DL-3/DL-4)

- **Per-stage content branch.** The drawer always shows the teaching entry for
  the _current_ stage key (`STAGE_TEACHING[stage]`); stage 1–5 each have one.
  Named counter-example: on stage 1 the drawer must NOT show stage 2's cache
  headline (`Shared cache-aside with tick-based TTL`) — it shows the single
  server narrative. §Tests pin it.
- **Open-state branch.** Drawer opens closed by default (first view remains the
  orrery), toggles from the HUD, and remembers state across stage switches
  within the page; unknown stages (should a future stage 6 land early) render
  the drawer with a minimal "Stage 6 notes pending" entry, never a blank panel.

## Pre-decided boundary contracts

### 1. `js/panel/teaching.js` (new module, content only, no render logic)

- Exports `STAGE_TEACHING` keyed `1–5` plus `describeStageTeaching(stage = 1)`.
- Entry shape: `{ headline, teaches: string[], try: string[], watchFor: string[],
tradeoff, primerLink: { label, url } }`.
- `primerLink` cites the matching system-design-primer section per stage
  (e.g. stage 2 → its Load balancer section; stage 4 → Availability patterns /
  replication; stage 5 → Asynchronism). Links open in a new tab
  (`target="_blank" rel="noreferrer"`); plain anchors only, no JS.
- Content ordering per stage mirrors the scaling ladder (the narrative layer of
  the tutor review: mechanism in app, names in primer terms).

### 2. Drawer UI (`panel.html`, `css/panel/*`, `js/panel/panel.js`)

- Toggle `data-testid="teaching-toggle"` (camera HUD area, next to legend
  toggle from the correctness brief) → `data-testid="teaching-panel"` aside.
- Renders `headline` (`.heading-section` token), three lists (`teaches`,
  `try`, `watchFor`) and the `tradeoff` line; `primerLink` as a plain link.
- Palette and spacing tokens only (surface / on-surface / accent-soft);
  `DOCTYPE`/CSP clean; no inline styles — class hooks in `css/panel/inspector.css`
  or a new `css/panel/teaching.css` ≤ 300 lines.

### 3. Tests & manifests

- `test/panel/teaching.test.js` (new):
  `describes all five stages with a headline, three lists, a tradeoff, and a primerLink`;
  `stage 1 content never mentions cache TTL names` (negative-case pin);
  `unknown stages degrade to a pending-entries placeholder, not a crash`.
- `e2e/panel.spec.js`: `should open the teaching drawer, trace it across stage switches, and show stage-1 content only on stage 1`;
  `should link to the system-design-primer section for the active stage`.
- Update `slices.yaml` + `storymap.yaml` (PANEL-1 rows: story `Open a per-stage teaching drawer naming the ladder concept and framing tradeoffs`) in the same commit.

## Execution steps

- [x] Step 1 (Lead session): human design sign-off committed in `DESIGN.md` and this brief.
- [x] Step 2 (Executor sub-agent): cold implementation from brief contracts, unit & e2e tests, manifest updates, and green `npm run verify`; tick this box and commit.
- [ ] Step 3 (Lead session): run `npm run metrics:extract -- <subagentSessionID>`, append entry to `docs/factory/slice-metrics.yaml`, tick Step 3, and commit.
