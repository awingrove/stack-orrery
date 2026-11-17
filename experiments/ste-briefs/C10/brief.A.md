You are a subagent spawned by another session.
You are executing Step 2 of the committed factory brief `docs/plans/2026-10-25-b5-compare-tray.md` on branch `feat/b5-compare-tray` (already checked out in the current working directory, stack-orrery). The brief is your contract source of truth — implement cold from it.

Before coding, read in this order:

1. `AGENTS.md` — repo rules: static vanilla-ESM stack, strict CSP (no inline handlers/scripts/styles), strict CHECKS:/PINS:/DOCUMENTS: claim vocabulary, manifests same-change, UI consumes the components' actual messages (the compare tray renders verbatim journey-log entries; it must never mint or rewrite hop frames).
2. `FACTORY.md`, `DESIGN.md` — note the 2026-10-25 Compare Tray entry (auto-pair diff, two most recent completed trace runs, hop-aligned, em-dash where one side ends sooner, snapshot-at-completion immune to the 20-entry cap, cleared on stage switch, hidden/incomplete-state rule).
3. The brief — especially its five branch contracts with named counter-examples, then the boundary contracts for model.js, compare.js, and the touchpoints.

Code you extend without breaking:

- `js/panel/model.js` (250 lines) — home of the pure contracts (`journeyEntryIsBefore`, `orderJourneyEntries`). Add `alignCompareRows(left, right)` → `[{ n, left, right }]` and `nextCompareSlots(slots, newRun)` → `{ a, b, changed }` phases per brief §1. Keep entries' `text` untouched (verbatim PINS).
- `js/panel/render.js` (295 lines) — owns `journeyEntries`. Add a `getRunEntries(run)` export (filter by run, hop-ascending — reuse the existing order semantics). Watch the 300-line cap; if adding it would overflow, extract whatever keeps it green, but prefer the smallest possible addition.
- `js/panel/panel.js` (294 lines) — `stepOneHop`'s completion branch (right after `relabelJourneyRun`) is the sole push site: build the snapshot via `getRunEntries(traceRunId)` and call `pushCompareRun` with the run's OWN descriptor from the trace snapshot (ground whether `snapshot.trace` carries a path/host field in `js/sim/trace.js` + `js/sim/trace-stage6.js` + `js/sim/cdn-chain.js`; if absent, fall back to `${els.method.value} ${els.urlInput.value}` captured at completion and REPORT it). `switchStage` receives `clearCompare()`. Watch the 300-line cap — if the completion-branch edit overflows, extract the run-entry orientation into compare.js (the push API can accept the raw run entries + label; decide and report).
- `js/panel/compare.js` (NEW) — DOM-bound module per brief §2: injects `#compare-tray` (headline `#compare-headline`, rows `#compare-rows`) into the existing `.log-card` at boot (lazy-lookup precedent: `renderDnsHud` / stage-6 cards in render.js/stage6-registry.js); exports `pushCompareRun` + `clearCompare` (and the injection is called from panel.js boot). Hidden/incomplete-state rule per brief. Uses engine-free, DOM-only logic; the pure slot/align logic lives in model.js.
- `css/panel/panel.css` (164 lines) — appended `.compare-tray` block: `.compare-row` grid `n | left | right`, mono font per DESIGN.md (protocol strings in var(--mono)), styling consistent with `.journey-entry`. Keep `.log-card` layout intact (mind the `.comp-tabs` spillover lesson — tray must not overflow the card; rows wrap or ellipsize, pick one per row and keep it consistent).
- CSS class for headline likewise (e.g. `.compare-headline`).

Tests per brief §4:

- `test/panel/model.test.js` (296 lines; e2e cap 450 for tests): alignment pins — unequal 9-by-6 runs produce 9 rows with rows 7–9 right side `—`; equal runs align; verbatim passthrough (texts byte-identical, no mutation); slot pushes: first fills A, second fills B changed:true, third shifts A←old-B/B←new; same-run re-push is a no-op (changed:false, slots unchanged); tick-shaped `{ hops: 0 }` runs are ignored (the trace-runs-only counter-example lives here).
- NEW `e2e/compare.spec.js`: four tests, titles verbatim from brief §4. Ground the exact paths/hop counts at write time by reading the sim + JS engine wiring (stage 3 MISS-then-HIT pairs; stage 6 `example.com/about` vs warm `cd.example.com/about` HIT → 9 vs 6 em-dash rows; crowd-tick exclusion; stage-switch clear). The tray is in the DOM (`#compare-tray`, `#compare-headline`, `#compare-rows` data-testids: use data-testid="compare-tray", "compare-headline", "compare-rows" on the injected elements). Do NOT add any lines to `e2e/panel.spec.js` (it is at the 450 cap).
- Manifests same-change: `slices.yaml` (PANEL e2e gains `e2e/compare.spec.js`; ground the structure before editing; obey guard-slices glob/dedup rules — if `js/**` panel files are glob-claimed, only the e2e spec is explicit) and `storymap.yaml` (matching rows gain the four e2e titles, names identical). If storymap rows are per-stage, ground which rows own cross-stage panel behavior and add the titles there; report the choice.

Hard rules unchanged. All existing tests keep passing unmodified except manifest-row additions. `npm run verify` is the named gate — red gate = fix the named cause; same-gate second rejection = stop and report.

Gate + close: run `npm run verify` (format → lint → unit → guard → e2e). Then tick `- [x] Step 2 (Executor sub-agent): …` in the brief and commit everything as `feat(b5): compare tray auto-pair diff of recent trace runs (b5 Step 2)` on `feat/b5-compare-tray`. Do NOT push, do NOT open a PR.

Report back: files added/changed (with final line counts of every js/css file touched vs the 300 caps), export names added, test titles added (unit + e2e), exact verify result, commit hash, the label-source decision (trace field vs URL-input fallback), and anything in the brief that was ambiguous or under-pinned.
