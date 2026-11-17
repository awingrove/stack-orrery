You are the factory executor sub-agent for stack-orrery.
You execute Step 2 of the committed brief `docs/plans/2026-10-25-b5-compare-tray.md`.
Branch `feat/b5-compare-tray` is active in the current working directory.
The committed brief is the contract source of truth.
Implement cold from the committed brief.

Before you write code, read these files in this order.

1. `AGENTS.md`. This file states the repo rules. The stack uses static vanilla ESM with strict CSP. Inline handlers, scripts, and styles are prohibited. Claim vocabulary uses `CHECKS:`, `PINS:`, and `DOCUMENTS:` only. Manifests must change in the same commit as the feature. The compare tray renders verbatim journey-log entries. The tray must not mint or rewrite hop frames.
2. `FACTORY.md` and `DESIGN.md`. Note the 2026-10-25 Compare Tray entry. The tray shows auto-pair diff of the two most recent completed trace runs. Rows align by hop. An em-dash appears where one side ends sooner. The system captures the snapshot at completion. The 20-entry cap does not affect the snapshot. The tray clears on stage switch. The hidden/incomplete-state rule applies.
3. The committed brief. Study the five branch contracts with named counter-examples. Study the boundary contracts for `model.js`, `compare.js`, and the touchpoints.
4. The code you extend. Read `js/panel/model.js`, `js/panel/render.js`, `js/panel/panel.js`, and `css/panel/panel.css`.

**model.js changes**

In `js/panel/model.js`, add `alignCompareRows(left, right)`. It must return `[{ n, left, right }]`. Add `nextCompareSlots(slots, newRun)`. It must return `{ a, b, changed }` per brief §1. Keep entries' `text` untouched. This is a verbatim PINS requirement.

**render.js changes**

In `js/panel/render.js`, add a `getRunEntries(run)` export. It must filter by run and return entries in hop-ascending order. Reuse the existing order semantics. Prefer the smallest possible addition. If the addition exceeds the 300-line cap, extract whatever keeps it green.

**panel.js changes**

In `js/panel/panel.js`, find the `stepOneHop` completion branch. It is right after `relabelJourneyRun`. This is the sole push site. Build the snapshot via `getRunEntries(traceRunId)`. Call `pushCompareRun` with the own descriptor of the run from the trace snapshot.

Before you choose the label source, read `js/sim/trace.js`, `js/sim/trace-stage6.js`, and `js/sim/cdn-chain.js`. Check if `snapshot.trace` carries a path/host field. If the field is absent, use `${els.method.value} ${els.urlInput.value}` captured at completion instead. You must REPORT this fallback decision.

In `switchStage`, call `clearCompare()`.

Warning: if the completion-branch edit exceeds the 300-line cap of panel.js, extract the run-entry orientation into compare.js. You can design the push API to accept raw run entries plus a label. Decide and report.

**compare.js (new file)**

Create new file `js/panel/compare.js`. It is a DOM-bound module per brief §2. It must inject `#compare-tray` into the current `.log-card` at boot. The tray contains headline `#compare-headline` and rows `#compare-rows`. Use the lazy-lookup precedent: `renderDnsHud` and stage-6 cards in render.js/stage6-registry.js. Export `pushCompareRun` and `clearCompare`. Call the injection from panel.js boot. Apply the hidden/incomplete-state rule per brief. compare.js must use engine-free, DOM-only logic. The pure slot/align logic must live in model.js.

**CSS changes**

In `css/panel/panel.css`, append a `.compare-tray` block. `.compare-row` must use grid layout `n | left | right`. Use mono font per DESIGN.md. Protocol strings use `var(--mono)`. Styling must be consistent with `.journey-entry`. Keep the `.log-card` layout intact. The tray must not overflow the card. Rows must wrap or ellipsize. Choose one per row and keep it consistent. Add a CSS class for the headline. Use `.compare-headline`.

**Unit tests**

In `test/panel/model.test.js`, add alignment pins. Unequal 9-by-6 runs must produce 9 rows with rows 7 through 9 right side `—`. Equal runs must align. Verbatim passthrough: texts must be byte-identical with no mutation. Slot-push pins: first fills A. Second fills B changed:true. Third shifts A←old-B/B←new. Same-run re-push must be a no-op with changed:false and slots unchanged. Tick-shaped `{ hops: 0 }` runs must be ignored. The trace-runs-only counter-example lives here.

Warning: the e2e cap for tests is 450 lines.

**E2E tests**

Create new file `e2e/compare.spec.js`. It must contain four tests. The test titles must match brief §4 verbatim.

- Stage 3 MISS-then-HIT pairs.
- Stage 6 `example.com/about` vs warm `cd.example.com/about` HIT gives 9 vs 6 em-dash rows.
- Crowd-tick exclusion.
- Stage-switch clear.

Before you write the tests, read the sim and JS engine wiring. Ground the exact paths and hop counts at write time. The injected elements must carry data-testids `compare-tray`, `compare-headline`, and `compare-rows`. You must not add any lines to `e2e/panel.spec.js`. It is at the 450 cap.

**Manifests**

Manifests must change in the same commit as the feature.

In `slices.yaml`, PANEL e2e gains `e2e/compare.spec.js`. Before you edit, ground the structure. Obey guard-slices glob/dedup rules. If the guard-slices glob covers `js/**` panel files, make only the e2e spec explicit.

In `storymap.yaml`, the corresponding rows gain the four e2e titles with names identical. If storymap rows are per-stage, ground which rows own cross-stage panel behavior. Add the titles there and report the choice.

**Test stability**

All existing tests must pass unmodified. The only exception is manifest-row additions.

**Gate rules**

You must not weaken any guardrail. Run `npm run verify` until it is green. This command runs format, lint, unit, guard, and e2e in order. On a red gate, fix the named cause. On a second rejection of the same gate, stop and report.

**Close**

Tick `- [x] Step 2 (Executor sub-agent): …` in the brief. Commit everything as `feat(b5): compare tray auto-pair diff of recent trace runs (b5 Step 2)` on `feat/b5-compare-tray`. You must not push. You must not open a PR.

**Report**

Report these items. List files added and changed. Include final line counts of every js/css file touched against the 300 caps. List export names added. List test titles added for unit and e2e. State the exact verify result. State the commit hash. State the label-source decision (trace field vs URL-input fallback). Note anything in the brief that was ambiguous or under-pinned.
