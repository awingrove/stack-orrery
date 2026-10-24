# Usability & state amendments (throughput, auto-refit, URL deep-links)

**For agentic workers:** read `AGENTS.md`, `FACTORY.md`, and `DESIGN.md` first.
Execute mechanically from Step 2 and keep `npm run verify` green at every commit.

## Hard rules

- **NEVER** weaken a guardrail, test assertion, threshold, or manifest rule. Stage 1 remains default on `/panel.html` load.
- **Zero runtime dependencies.** Vanilla ESM only; no inline handlers/styles (CSP).
- **Determinism.** `js/sim/**` never calls `Math.random()` or `Date.now()`.
- **Claim vocabulary.** Strict `CHECKS:`, `PINS:`, or `DOCUMENTS:` tags only.
- **File size.** Modules ≤ 300 lines, tests ≤ 450 lines, HTML ≤ 550 lines.
- **Same-change manifests.** Update `slices.yaml` and `storymap.yaml` in the same commit.

## Negative-case contracts (DL-3/DL-4)

- **Throughput branch.** `throughputPerTick = served / tick` when `tick > 0`; at
  `tick === 0` it is `0` — and the UI must render `0.00/t`, never `NaN`/`Infinity`.
  Named counter-example: a fresh stage-1 panel at tick 0 shows the SERVED card as
  `0` + `0.00/t`. §Tests pin it.
- **Auto-refit branch.** Refit fires when the world bounding box grows past the
  viewport (stage switch, user-count increase); a manual camera action
  (pointer drag, wheel zoom, `+`/`-` buttons) cancels pending auto-refit.
  Named counter-example: after a manual `btn-zoom-in`, the camera must NOT refit
  on the next soundless tick; only stage/slider changes re-arm it. §Tests pin it.
- **URL fallback branch.** `panel.html?stage=N&users=U`: `N` clamps to live
  stages 1–5, `U` clamps 1–50; anything unknown falls back to stage 1 / 5 users
  without console error. Named counter-example: `?stage=9` must NOT crash or
  select a disabled pill — it renders stage 1. §Tests pin it.

## Pre-decided boundary contracts

### 1. Throughput counter (`js/panel/model.js`, `panel.html`)

- `describeSnapshot()` adds `servedRate: served-per-tick formatted `"0.00/t"`
  (2 decimals, tabular-nums per DESIGN.md token rule).
- The SERVED stat card gains a subordinate line `data-testid="served-rate"`;
  the cumulative `SERVED` value (`served`) stays.

### 2. Auto-refit (`js/panel/camera.js`, `js/panel/panel.js`)

- After the stage topology or user count changes, if world bbox exceeds the
  viewport, invoke the same fit routine as `btn-zoom-fit`; `zoom-status`
  reflects the refit. Manual pointer/wheel/button actions suppress auto-refit
  until the next layout-size change.

### 3. URL deep-links (`js/panel/panel.js`)

- On load: read `history`-safe `URLSearchParams` → apply stage + users.
- On change (stage pill click, slider commit): replace-URL via
  `history.replaceState` (no history spam), keeping shareable state.
- Unknown/missing params default exactly like a fresh load.

### 4. Tests & manifests

- `test/panel/model.test.js`: `snapshot exposes throughput per tick alongside served total`;
  `tick 0 renders 0.00/t without NaN` (pinning the tick-0 branch above).
- `test/panel/camera.test.js`: `refits when the world grows past the viewport and auto-refit cancels on manual zoom`.
- `e2e/panel.spec.js`: `should deep-link ?stage=5&users=30 to stage 5 with 30 browsers`;
  `should fall back to stage 1 on unknown ?stage=9 without errors`;
  `should show the SERVED card tallying per tick without NaN at tick 0`.
- Update `slices.yaml` + `storymap.yaml` (PANEL-1 rows: story `Deep-link the panel state…` added) in the same commit.

## Execution steps

- [ ] Step 1 (Lead session): human design sign-off committed in `DESIGN.md` and this brief.
- [x] Step 2 (Executor sub-agent): cold implementation from brief contracts, unit & e2e tests, manifest updates, and green `npm run verify`; tick this box and commit.
- [ ] Step 3 (Lead session): run `npm run metrics:extract -- <subagentSessionID>`, append entry to `docs/factory/slice-metrics.yaml`, tick Step 3, and commit.
