# C10 — requirements extracted from arm A

Source: `brief.A.md` (dispatch text exactly as received). The committed brief
`docs/plans/2026-10-25-b5-compare-tray.md` is an arm-independent instruction
file present in the start commit.

1. Treat the committed brief (`docs/plans/2026-10-25-b5-compare-tray.md`) as the contract source of truth; implement cold from it.
2. Execute Step 2 of that brief on branch `feat/b5-compare-tray` (already checked out) in the current working directory (stack-orrery).
3. Before coding, read `AGENTS.md` (static vanilla-ESM stack, strict CSP — no inline handlers/scripts/styles, strict `CHECKS:`/`PINS:`/`DOCUMENTS:` claim vocabulary, manifests same-change, UI consumes the components' actual messages — the compare tray renders verbatim journey-log entries and must never mint or rewrite hop frames).
4. Before coding, read `FACTORY.md` and `DESIGN.md`, noting the 2026-10-25 Compare Tray entry (auto-pair diff, two most recent completed trace runs, hop-aligned, em-dash where one side ends sooner, snapshot-at-completion immune to the 20-entry cap, cleared on stage switch, hidden/incomplete-state rule).
5. Before coding, read the brief — especially its five branch contracts with named counter-examples, then the boundary contracts for model.js, compare.js, and the touchpoints.
6. Before coding, read the listed code you extend without breaking: `js/panel/model.js`, `js/panel/render.js`, `js/panel/panel.js`, `css/panel/panel.css`.
7. In `js/panel/model.js`: add `alignCompareRows(left, right)` → `[{ n, left, right }]` and `nextCompareSlots(slots, newRun)` → `{ a, b, changed }` phases per brief §1.
8. Keep entries' `text` untouched (verbatim PINS).
9. In `js/panel/render.js`: add a `getRunEntries(run)` export (filter by run, hop-ascending — reuse the existing order semantics); prefer the smallest possible addition; if adding it would overflow the 300-line cap, extract whatever keeps it green.
10. In `js/panel/panel.js`: `stepOneHop`'s completion branch (right after `relabelJourneyRun`) is the sole push site — build the snapshot via `getRunEntries(traceRunId)` and call `pushCompareRun` with the run's OWN descriptor from the trace snapshot.
11. Ground whether `snapshot.trace` carries a path/host field in `js/sim/trace.js`, `js/sim/trace-stage6.js`, and `js/sim/cdn-chain.js`; if absent, fall back to `${els.method.value} ${els.urlInput.value}` captured at completion and REPORT it.
12. `switchStage` receives `clearCompare()`.
13. If the completion-branch edit overflows panel.js's 300-line cap, extract the run-entry orientation into compare.js (the push API can accept raw run entries + label; decide and report).
14. Deliver NEW `js/panel/compare.js` — DOM-bound module per brief §2: injects `#compare-tray` (headline `#compare-headline`, rows `#compare-rows`) into the existing `.log-card` at boot (lazy-lookup precedent: `renderDnsHud` / stage-6 cards); exports `pushCompareRun` + `clearCompare`; the injection is called from panel.js boot.
15. Apply the hidden/incomplete-state rule per brief.
16. compare.js uses engine-free, DOM-only logic; the pure slot/align logic lives in model.js.
17. In `css/panel/panel.css`: append a `.compare-tray` block — `.compare-row` grid `n | left | right`, mono font per DESIGN.md (protocol strings in `var(--mono)`), styling consistent with `.journey-entry`.
18. Keep the `.log-card` layout intact — the tray must not overflow the card; rows wrap or ellipsize, pick one per row and keep it consistent.
19. Add a CSS class for the headline (e.g. `.compare-headline`).
20. Unit tests in `test/panel/model.test.js` — alignment pins: unequal 9-by-6 runs produce 9 rows with rows 7–9 right side `—`; equal runs align; verbatim passthrough (texts byte-identical, no mutation); slot pushes: first fills A, second fills B changed:true, third shifts A←old-B/B←new; same-run re-push is a no-op (changed:false, slots unchanged); tick-shaped `{ hops: 0 }` runs are ignored (the trace-runs-only counter-example lives here).
21. NEW `e2e/compare.spec.js`: four tests, titles verbatim from brief §4 — stage 3 MISS-then-HIT pairs; stage 6 `example.com/about` vs warm `cd.example.com/about` HIT → 9 vs 6 em-dash rows; crowd-tick exclusion; stage-switch clear.
22. Ground the exact paths/hop counts at write time by reading the sim + JS engine wiring.
23. The injected elements carry data-testids `compare-tray`, `compare-headline`, `compare-rows`.
24. Do NOT add any lines to `e2e/panel.spec.js` (at the 450 cap).
25. Manifests same-change: `slices.yaml` — PANEL e2e gains `e2e/compare.spec.js`; ground the structure before editing; obey guard-slices glob/dedup rules (if `js/**` panel files are glob-claimed, only the e2e spec is explicit).
26. `storymap.yaml` — matching rows gain the four e2e titles, names identical; if storymap rows are per-stage, ground which rows own cross-stage panel behavior, add the titles there, and report the choice.
27. All existing tests keep passing unmodified except manifest-row additions.
28. Never weaken a guardrail.
29. Run `npm run verify` (format → lint → unit → guard → e2e) to green.
30. On a red gate, fix the named cause; on a second rejection of the same gate, stop and report.
31. Tick `- [x] Step 2 (Executor sub-agent): …` in the brief.
32. Commit everything as `feat(b5): compare tray auto-pair diff of recent trace runs (b5 Step 2)` on `feat/b5-compare-tray`.
33. Do not push; do not open a PR.
34. Report back: files added/changed (with final line counts of every js/css file touched vs the 300 caps), export names added, test titles added (unit + e2e), exact verify result, commit hash, the label-source decision (trace field vs URL-input fallback), and anything in the brief that was ambiguous or under-pinned.
