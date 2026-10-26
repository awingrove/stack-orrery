# B-5 — Compare tray: auto-pair diff of the two most recent trace runs

**For agentic workers:** read `AGENTS.md`, `FACTORY.md`, `DESIGN.md` first; execute Step 2 mechanically with `npm run verify` green at every commit. Human sign-off 2026-10-25 (auto pair).

## Hard rules

- **NEVER** weaken a guardrail, test, threshold, or manifest rule. Zero runtime deps; no inline handlers/styles (CSP); strict `CHECKS:`/`PINS:`/`DOCUMENTS:` vocabulary.
- **File size:** js/css ≤ 300 (`model.js` 250, `render.js` 295, `panel.js` 294 — add a new module rather than padding; `panel.css` has room), tests ≤ 450 (`e2e/panel.spec.js` sits at exactly 450 — add NO lines there; e2e goes in a new spec), `panel.html` ≤ 550 — it is at 546, so the tray is JS-built into the existing log-card (`panel.html` touches: NONE preferred; only if unavoidable, ≤ 2 lines and no pinned testid moves).
- **Same-change manifests:** `slices.yaml` + `storymap.yaml` with the feature.
- **No new narrative (DL-1/DL-3):** the compare tray renders verbatim journey-log entry texts. It never mints, rewrites, or summaries hop frames.

## Branch contracts (DL-3/DL-4) — with named counter-examples

- **Trace-runs-only.** A run enters the tray ONLY from the completion branch of `panel.js` `stepOneHop` (the same branch that calls `relabelJourneyRun`). Crowd ticks (`addToJourney('tick …', { run })`) never push. Named counter-example: starting the crowd while two traces ran leaves the tray showing exactly those two trace runs (a tick entry must not shift slots).
- **Two distinct runs.** A completed run equal to the current right slot's run id is a no-op (the tray does not duplicate). Pushing when A is empty fills A then B. A third distinct run shifts A ← old B, B ← new.
- **Snapshot at completion.** The tray stores the run's entry objects copied at completion (`getRunEntries` from render.js); later `JOURNEY_CAP` trims of the live log array must not empty or reorder the tray rows. Named counter-example: after three more full trace runs the tray still shows all rows of its two stored runs.
- **Stage switch clears.** `switchStage` empties the tray (cross-stage shapes are not comparable). Counter-example: pin two stage-6 runs, switch to stage 1, tray renders empty (no stale rows, no crash).
- **Alignment.** Rows align by hop index over `max(left.hops, right.hops)`; the exhausted side renders `—`. Frames verbatim. Counter-example: 9-by-6 runs → 9 rows, rows 7–9 right cell `—`; nothing drops.
- **Hidden when pair incomplete/empty.** Zero or one stored run → no tray rows render (hidden or empty-state line, pick one and stay consistent).

## Pre-decided boundary contracts

### 1. `model.js` pure exports (DOM-free, unit-tested)

- `alignCompareRows(left, right)` → array of `{ n, left, right }` (`n` = ball from 1; each side is that hop's `text` or `—`); never mutates entry texts (PINS verbatim).
- `nextCompareSlots(slots, newRun)` → new `{ a, b, changed }` implementing the shift/no-op/first-fill branch above (pure; e2e exercises the DOM side).
- Both join the existing pure-contract exports (`orderJourneyEntries` style) in `test/panel/model.test.js` (or a sibling `model-compare.test.js` if that file would pass 450 — ground the current line count).

### 2. `js/panel/compare.js` (new, DOM-bound; covered by e2e)

- Injects the tray into the existing log-card at boot (lazy lookup precedent from renderDnsHud / stage-6 cards): `#compare-tray` with headline `#compare-headline` (`9 vs 6 hops · <left> vs <right>`) and `#compare-rows`.
- Exports `pushCompareRun({ run, label, hops, entries })` and `clearCompare()`; `panel.js` completion branch and `switchStage` are the only callers. **`label`:** use the run's own request descriptor from the trace snapshot if a path/host field exists there (ground it in trace.js — 6b frames carry `trace.path`); if absent, fall back to the URL input's value at completion and REPORT the choice.
- Headline text: `${left.hops} vs ${right.hops} hops · ${leftLabel} vs ${rightLabel}`.
- Row CSS in `css/panel/panel.css` appended block (mono, matches log styling: `.compare-row` grid `n | left | right`).

### 3. Touchpoints

- `panel.js` completion branch (after `relabelJourneyRun`): build the entry snapshot via a new `getRunEntries(run)` export on render.js (filter `journeyEntries` by run, ascending — reuse model ordering), then `pushCompareRun`.
- `switchStage`: `clearCompare()`.
- No proxy/test double anywhere — the tray reads the panel's real logged entries.

### 4. Tests & manifests

- Unit: alignment + slot branch unit pins incl. both counter-examples above (snapshot-immunity pin, tick-never-compared pin lives in the slot-purity pin: a tick-shaped run `{ hop: 0 }` fed to `nextCompareSlots` is rejected — spell the rejection rule: runs with `hops` < 2 or no hop entries are ignored).
- e2e NEW `e2e/compare.spec.js`: `should compare the last two trace runs hop-by-hop in the compare tray` (stage 3: MISS then HIT over `example.com` — 9-by-9 or 9-by-6 grounded at write time); `should show em-dash rows where one run is shorter (9 vs 6)` (stage 6: `example.com/about` vs `cd.example.com/about` HIT after a warm-↑ MISS); `should never compare crowd-tick runs into the tray` (start crowd, verify headline/runs unchanged); `should clear the compare tray on a stage switch`.
- Manifests: `slices.yaml` PANEL e2e gains the new spec file; `storymap.yaml` matching rows gain the four titles (names identical; ground rows first). If SIM rows also need a slot per repo convention, add `js/panel/compare.js` to the claimed files list consistently — obey the glob/dedup rules of guard-slices.

## Execution steps

- [x] Step 1 (Lead session): sign-off (auto pair) committed in `DESIGN.md` (Compare Tray pattern) and this brief.
- [x] Step 2 (Executor sub-agent): cold implementation, unit & e2e tests, manifest updates, green `npm run verify`; tick and commit.
- [x] Step 3 (Lead session): run `npm run metrics:extract -- <subagentSessionID>`, append entry to `docs/factory/slice-metrics.yaml`, tick Step 3, commit.
