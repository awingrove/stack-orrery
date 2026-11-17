# C10 brief.C — compare tray auto-pair diff (b5 Step 2)

You are executing Step 2 of the committed factory brief
`docs/plans/2026-10-25-b5-compare-tray.md` on branch `feat/b5-compare-tray`
(already checked out in the current working directory, stack-orrery). The
brief is your contract source of truth — implement cold from it.

## Pre-coding reads

Before coding, read these files in order:

1. `AGENTS.md` — static vanilla-ESM stack, strict CSP (no inline
   handlers/scripts/styles), strict `CHECKS:`/`PINS:`/`DOCUMENTS:` claim
   vocabulary, manifests same-change. The compare tray renders verbatim
   journey-log entries; it must never mint or rewrite hop frames.
2. `FACTORY.md` and `DESIGN.md` — note the 2026-10-25 Compare Tray entry:
   auto-pair diff, two most recent completed trace runs, hop-aligned,
   em-dash where one side ends sooner, snapshot-at-completion immune to the
   20-entry cap, cleared on stage switch, hidden/incomplete-state rule.
3. The brief itself — especially the five branch contracts with named
   counter-examples, then the boundary contracts for `model.js`,
   `compare.js`, and the touchpoints.
4. The existing files listed below, which you extend without breaking.
   Read them to understand the current structure and line counts before
   making changes.

## Code to extend

- **`js/panel/model.js`** (~250 lines). Home of the pure contracts
  (`journeyEntryIsBefore`, `orderJourneyEntries`). Add, per brief §1:
  - `alignCompareRows(left, right)` → `[{ n, left, right }]`
  - `nextCompareSlots(slots, newRun)` → `{ a, b, changed }`

  Both are pure functions. Keep entries' `text` untouched (verbatim PINS).
  These functions handle the slot allocation and row alignment logic for the
  compare tray.

- **`js/panel/render.js`** (~295 lines). Owns `journeyEntries`. Add a
  `getRunEntries(run)` export — filter by run, hop-ascending, reusing the
  existing order semantics. Prefer the smallest possible addition to keep
  the file under its cap. If it would overflow the 300-line cap, extract
  whatever keeps it green.

- **`js/panel/panel.js`** (~294 lines). `stepOneHop`'s completion branch
  (right after `relabelJourneyRun`) is the sole push site. Build the
  snapshot via `getRunEntries(traceRunId)` and call `pushCompareRun` with
  the run's own descriptor from the trace snapshot. Ground whether
  `snapshot.trace` carries a path/host field by reading `js/sim/trace.js`,
  `js/sim/trace-stage6.js`, and `js/sim/cdn-chain.js`. If absent, fall
  back to `` `${els.method.value} ${els.urlInput.value}` `` captured at
  completion and report it. `switchStage` receives `clearCompare()`.
  Watch the 300-line cap — if the completion-branch edit overflows,
  extract the run-entry orientation into `compare.js` (the push API can
  accept raw run entries plus label; decide and report which you chose).

- **`js/panel/compare.js`** (NEW). DOM-bound module per brief §2. Injects
  `#compare-tray` (headline `#compare-headline`, rows `#compare-rows`) into
  the existing `.log-card` at boot (lazy-lookup precedent: `renderDnsHud` /
  stage-6 cards in `render.js`/`stage6-registry.js`). Exports
  `pushCompareRun` + `clearCompare`. The injection is called from
  `panel.js` boot. Hidden/incomplete-state rule per brief. Uses
  engine-free, DOM-only logic; the pure slot/align logic lives in
  `model.js`. This module owns the DOM wiring only.

- **`css/panel/panel.css`** (~164 lines). Append a `.compare-tray` block:
  `.compare-row` grid `n | left | right`, mono font per `DESIGN.md`
  (protocol strings in `var(--mono)`), styling consistent with
  `.journey-entry`. Keep `.log-card` layout intact — the tray must not
  overflow the card; rows wrap or ellipsize, pick one per row and keep it
  consistent. Add a CSS class for the headline (e.g. `.compare-headline`).
  Mind the `.comp-tabs` spillover lesson from earlier slices.

## Tests

**`test/panel/model.test.js`** (~296 lines; e2e cap 450 for tests).
Add alignment pins for the new functions:

- Unequal 9-by-6 runs produce 9 rows with rows 7–9 right side `—`.
- Equal runs align.
- Verbatim passthrough — texts byte-identical, no mutation.
- Slot pushes: first fills A, second fills B `changed:true`, third shifts
  A←old-B/B←new.
- Same-run re-push is a no-op (`changed:false`, slots unchanged).
- Tick-shaped `{ hops: 0 }` runs are ignored (the trace-runs-only
  counter-example lives here).

**NEW `e2e/compare.spec.js`**. Four tests, titles verbatim from brief §4:

- Stage 3 MISS-then-HIT pairs.
- Stage 6 `example.com/about` vs warm `cd.example.com/about` HIT → 9 vs 6
  em-dash rows.
- Crowd-tick exclusion.
- Stage-switch clear.

Ground the exact paths and hop counts at write time by reading the sim and
JS engine wiring. The tray is in the DOM with `data-testid="compare-tray"`,
`data-testid="compare-headline"`, `data-testid="compare-rows"` on the
injected elements. Use these data-testids for e2e selectors. Do not add any
lines to `e2e/panel.spec.js` — it is at the 450 cap.

## Manifests same-change

Both manifests must change in this commit:

- **`slices.yaml`** — PANEL e2e gains `e2e/compare.spec.js`. Ground the
  structure before editing. Obey guard-slices glob/dedup rules (if
  `js/**` panel files are glob-claimed, only the e2e spec is explicit).
- **`storymap.yaml`** — matching rows gain the four e2e titles, names
  identical. If storymap rows are per-stage, ground which rows own
  cross-stage panel behavior, add the titles there, and report the choice.

## Gate and close

All existing tests keep passing unmodified except manifest-row additions.
Never weaken a guardrail, test, or manifest entry to pass.

Run `npm run verify` (format → lint → unit → guard → e2e). On a red gate,
fix the named cause. On a second rejection of the same gate, stop and
report to the human.

Then tick `- [x] Step 2 (Executor sub-agent): …` in the brief and commit
everything as `feat(b5): compare tray auto-pair diff of recent trace runs (b5 Step 2)`
on `feat/b5-compare-tray`. Do not push; do not open a PR. The branch is
already checked out in your working directory.

## Report back

Report: files added/changed with final line counts of every JS/CSS file
touched versus the 300 caps, export names added, test titles added (unit
and e2e), exact verify result, commit hash, the label-source decision
(trace field versus URL-input fallback), and anything in the brief that was
ambiguous or under-pinned. Be specific about any assumptions you made when
the brief was unclear.
