# Full-review recommendations — staged for the factory process

- **Source:** `assessment.md` (ranks 1–15) + chunk-10 gate forensics +
  chunk-8 tooling review. Raw findings live in
  `reports/chunk-{1..10}-*.md`; systemic gaps are registered as
  **TD-6..TD-11** in `docs/factory/technical-debt.yaml` (open).
- **Ordering principle:** truthfulness of teaching surfaces first (the one
  recurring defect class), then derivable-knowledge paydown, then planned
  size-gate splits, then tooling/process. Each stage is 2–3 brief-sized
  slices (≤120-line boundary-contract briefs; cold executor; acceptance
  probe), sized so no slice depends on a later one and every slice leaves
  `npm run verify` green.

## Stage R1 — Sim truth mechanics (TD-9 partially, from rank 1)

| Slice                           | Work                                                                                                                                                                                                               | Finding ids            | Register                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ---------------------------------- |
| R1a `stage6-lb-hop-unification` | Shared `lbEnqueueHop(trace, …)` in `trace-helpers.js`; both trace machines call it; stage-6 all-down engine test pins the stage-1..5 refusal frame byte-shape; `refused` field unified in both `freshTrace` shapes | 1-01, 1-02, 1-08       | part of TD-8's sim-side completion |
| R1b `sim-micro-truth-cluster`   | `cdn.lookup` returns `{status, body}`; webserver address mini-IP validation; `cdn-chain` imports the 3 helpers + `routeIdFor` instead of re-declaring                                                              | 2-01, 2-02, 2-03, 2-04 | TD-9 (sim side)                    |

Boundary-contract points for briefs: `lbEnqueueHop` returns
`{frame, refused}`; `selectTarget` keeps the `{refused: true}` record shape
(`{from, to, request, response: null, refused: true}`); the stage-6
all-down engine pin must be the DL-3-style named counter-example (negative:
exact same frames as stage-2..5 machine, not merely "no crash").

## Stage R2 — Derive the panel from the sim (TD-9)

| Slice                            | Work                                                                                                                                                                                                                                                                                                                 | Finding ids                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| R2a `finalHop-shared-seam`       | `finalHop(stage, trace?)` in `trace-helpers.js`; panel `TOTAL_HOPS` (both copies, incl. `panel.js:36`) and `traceFinalHop` replaced; feasibility caveats honored (stage-2..5 refusal semantics: pass `t` only in stages 1/5/6 or align sentence arrays — deep-dive adjudicated)                                      | 3-05, 5-03                                       |
| R2b `sim-defaults-single-home`   | `js/sim/addresses.js` (MINI_IP ×7+inline, subnetOf, address defaults) consumed by 8 sites; `js/panel/sim-defaults.js` re-exporting cache TTL/DNS TTL/lag/jobDuration/serviceRate (or snapshots always populate them, the stronger option); `serviceRate`↔`serviceRatePerTick` rename with `model.test.js:242` update | 1-03, 1-04, 1-05, 3-02, 3-03, 3-09, part of 2-03 |
| R2c `snapshot-pool-truth`        | `snapshot().queue`/`.files` pooled or renamed `primary*` with per-server views; fs-editor consumer updated                                                                                                                                                                                                           | 1-06                                             |
| R2d `network-registry-read-side` | sim network exports `registry()` (address + role, populated at `registerServer`); `inspector-state.js:79-141` ternary table consumed → derived                                                                                                                                                                       | 3-01                                             |

## Stage R3 — Teaching surfaces tell the truth (TD-8, TD-6)

| Slice                        | Work                                                                                                                                                                                                                                            | Finding ids                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| R3a `inspector-real-source`  | Render real `js/sim` source via `fetch`/static server (CSP-fine) replacing hand-copied mirrors, or re-label as "simplified excerpt" + structural-parity test (`Object.keys(COMPONENT_SOURCE)` ↔ 10 components; every entry valid `js/sim` path) | 5-01, 6-07(#5)                     |
| R3b `teaching-vocab-binding` | Export `TRACE_VOCAB` from trace machines; teaching fragments reference tokens; unit test asserts quoted fragments appear verbatim in real `traceHop` output per stage                                                                           | 5-02                               |
| R3c `hop-targets-pin-truth`  | `test/panel/hop-targets.test.js` (stage 1–4 chains incl. 10.12/WRITE branches; stage-5 asyncJob counter-example; stage-6 `hop - 2` + CDN HIT/MISS) + tuple-table refactor (~45%, gemini-adjudicated) + header corrected to real pins            | 4-01, 4-04, 6-07(#1) — closes TD-6 |
| R3d `panel-pure-core-tests`  | `test/panel/fault-console.test.js` (READERS/WRITERS round-trip through engine setters), `journey-log.test.js` (dedupe/cap/relabel/`getRunEntries` copies), `model-dbop` 4-branch pins incl. WRITE_DOWN                                          | 6-07(#2-4)                         |

## Stage R4 — Render/interaction hygiene (low cluster)

Slices fold into R3d/R5a as capacity allows; each item is ≤10-line-sized:

- 4-02: render-stage drops its world-space `left/top` write; `positionParts` owns the first (DL-1 total).
- 4-03: wire-id parity unit pin (`LANE_WIRES` ↔ `makeWire` ids).
- 4-07/4-08/4-09: shared empty-state constant; camera-default comment; `viewSize` zero-width guard.
- 5-04..5-07: `initialized` guards for fs-editor/teaching-drawer; `latestSnapshot` rename; `cardChips` lifecycle comment; missions-view/fault-console singleton closure wrap.
- 6-01/6-02: `render.test.js` → `journey-ordering.test.js` rename; LB-failover toggle-no-residue mirror (~10 lines).
- 6-06: camera.test fixtures if the gate gets close.

## Stage R5 — Planned at-the-gate splits (TD-10)

Execute **before** Stage 7 design so pressure never forces an unplanned
split. Each is its own brief with a named responsibility boundary; chunk-10
verdict: each file is one split, not an emergency.

| Slice                             | Work                                                                                                                   | Finding ids                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| R5a `panel-spec-split`            | `panel.spec.js` → overload story / stage-ladder / panel-hygiene specs; reuse `fault-console-helpers.js` pattern        | 7-01                                      |
| R5b `canvas-nodes-rehome`         | node-card/wire-column rules (canvas.css:206-296) → `nodes.css`                                                         | 7-02                                      |
| R5c `viewport-input-split`        | interaction listeners → `viewport-input.js`; camera/position/ownership stays                                           | 4-06; closes 4-05 stage-7 runbook comment |
| R5d `inspector-state-data-module` | per-stage interface tables → data module with real comments (restores comment density); kills the ternary write-around | 10-04                                     |
| R5e `engine-trace-pre-splits`     | engine.js snapshot-assembly + trace.js stage-5 prelude extractions while there is headroom to do them well             | 1-07                                      |

## Stage R6 — Tooling + process (TD-7, TD-11)

| Slice                                | Work                                                                                                                                                                                                                                                                                                                                                                                                                         | Finding ids                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| R6a `guard-scan-tightening`          | split `extract-session-metrics.mjs` (parse/aggregate); add `scripts/` to SOURCE_DIRS at 300; soft warn-only CI signal for >100-char lines in prod js/css; `JSON.parse` try/catch + exit-code handling; `/tmp` → `os.tmpdir()`; CSP on 404/500; `tokensReasoning` cleanup                                                                                                                                                     | 8-01..8-05, 10-05 — closes TD-7                                                                     |
| R6b `ledger-convention-right-sizing` | `human_interventions` solicited/unsolicited split (or approval-notes field); "considered-and-declined" register subsection so NOT-defect judgments have a positive record; brief-template note that guard-claims scope is source comments; remediation trace for the four pre-convention briefs (verify shipped tests already pin their negative branches, then document); optional WebKit project in `playwright.config.js` | 9-05, 9-07, 9-08, 9-09, 7-05 (mission-latch helper), 7-07, 7-06 (describes-per-file) — closes TD-11 |

## Sequencing and interlocks

- **R1a before R3b/R2a:** both later stages consume the unified trace
  vocabulary/hop surfaces.
- **R5d before Stage 7 planning:** the inspector-state data module is the
  shape R2d's registry feeds into.
- **R6a's script-split before adding scripts/ to the guard** — otherwise
  `extract-session-metrics.mjs` fails its own gate the day the guard
  tightens.
- **Every slice's Step-1 brief should carry its TD-id in a `Registers:` line**
  so Step 3 can tick the register item when the paydown lands (kit
  DEBT-REGISTER same-change flow).
- Sizing estimate: R1 ≈ 2 briefs, R2 ≈ 4 (R2c/R2d can merge if small), R3
  ≈ 4, R4 folds elsewhere, R5 ≈ 5 small briefs, R6 ≈ 2 → ≈ 15–17 briefs
  at the current cadence (23 briefs / 19 days) ≈ 2 weeks.
- **Not registered (considered, not systemic):** cosmetic CSS token slips
  (7-03/7-04 — one-line fixes riding any slice), test-suite readability
  smalls (7-05/7-06), pure-praise-only themes. They ride the stages above
  as capacity items rather than carrying their own register rows.
