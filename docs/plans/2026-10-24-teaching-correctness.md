# Teaching-correctness amendments (inspector headline, journey log, legend, stage-5 copy)

**For agentic workers:** read `AGENTS.md`, `FACTORY.md`, and `DESIGN.md` first.
Execute mechanically from Step 2 and keep `npm run verify` green at every commit.

## Hard rules

- **NEVER** weaken a guardrail, test assertion, threshold, or manifest rule. Stage 1 remains default on `/panel.html` load.
- **Zero runtime dependencies.** Vanilla ESM only; no inline handlers/styles (CSP `script-src 'self'; style-src 'self'`).
- **Determinism.** `js/sim/**` never calls `Math.random()` or `Date.now()`.
- **Claim vocabulary.** Strict `CHECKS:`, `PINS:`, or `DOCUMENTS:` tags only.
- **File size.** Modules ≤ 300 lines, tests ≤ 450 lines, HTML ≤ 550 lines (`scripts/guard-file-size.mjs`).
- **Same-change manifests.** Update `slices.yaml` and `storymap.yaml` in the same commit.

## Negative-case contracts (DL-3/DL-4)

- **Stage-aware inspector headline.** Branch: headline addresses derive from the
  live snapshot's component addresses, never the static source entry in
  `js/panel/inspector-source.js`. Named counter-example: on stage 1 the headline
  must read `WebServer — mini-IP 10.1` and must NOT read `10.11 / 10.12` while
  `#inspector-state` shows `"address": "10.1"`. §Tests pin it.
- **Journey-log chronology.** Branch: entries of a single trace run always render
  in ascending hop order, whatever emission order the trace engine produces.
  Named counter-example: a 4-hop trace must never show `hop 2/4` above `hop 1/4`
  when read top-down. Preserve newest-run-first across runs: a run completed
  later floats above a run completed earlier, but never within itself. §Tests pin it.

## Pre-decided boundary contracts

### 1. Stage-aware inspector headline (`js/panel/inspector-state.js`, `js/panel/inspector-source.js`)

- `inspector-source.js` keeps static `file`/`code` but stops pinning per-stage
  addresses in `title`; the rendered `#inspector-title` is built per snapshot
  (e.g. stage 1 `WebServer — mini-IP 10.1`; stages 2–5 `WebServer — mini-IP 10.11 / 10.12`).
- Every inspector tab title follows the same derive-from-snapshot rule.
- Existing unit test pins that embed the old headline are updated, not weakened.

### 2. Journey-log chronology (`js/panel/render.js`, `js/panel/model.js`)

- Log entries carry a run key `(traceId, hop, tick)`; rendering orders by hop
  ascending inside a run; `#journey-log` cap (20 entries) and headline
  `#exchange-inspector` behavior stay unchanged.

### 3. Legend drawer & tooltips (`panel.html`, `css/panel/*`, `js/panel/panel.js`)

- New toggle button `data-testid="legend-toggle"` (camera HUD area) and drawer
  `data-testid="legend-panel"` explaining: tick = 100 ms (`TICK_MS = 100` in
  `js/panel/model.js`), the cache stats trio (`Hits / Misses / TTL-remaining`),
  `site` chips on ring 3 nodes, wire-lane labels (`request =>`, `<- response`,
  `enqueue =>`, `write =>`). Uses existing palette tokens only; no new colors.
- Every trace/camera/load control — `btn-url-go`, `btn-play-request`,
  `btn-next-hop`, `start-button`, `step-button`, `btn-zoom-fit`, `btn-zoom-in`,
  `btn-zoom-out` — gets a non-empty `title` attribute.

### 4. Stage-5 landing card copy (`index.html`)

- Rewrites the 5 · Worker Queue ladder card to the stage 1–4 detail level: 7
  rings, WorkerQueue `10.40`, Worker `10.41`, async `202 {"jobId": …}` response
  before worker completion, results committed to Primary `10.30`.

### 5. Tests & manifests

- `test/panel/model.test.js`: headline-derivation unit tests (stage 1 vs stage 2
  branch, with the named counter-example above) and journey-order labels.
- `test/panel/render.test.js` (new): run ordering — `within one run, hop entries
order ascending regardless of emission order` and `a newer run floats above an
older one; entries stay whole per run`.
- `e2e/panel.spec.js`: `should show the stage-1 webserver headline naming 10.1 only`;
  `should render a full-trace journey log with hop 1/4 to 4/4 in ascending order`.
- `e2e/shell.spec.js` or panel spec: legend toggle reveals `tick = 100 ms` text;
  all listed controls expose a non-empty `title`.
- Update `slices.yaml` + `storymap.yaml` (PANEL-1/… rows: story `Read hop narrative…`
  may be added under PANEL-1) in the same commit.

## Execution steps

- [ ] Step 1 (Lead session): human design sign-off committed in `DESIGN.md` and this brief.
- [x] Step 2 (Executor sub-agent): cold implementation from brief contracts, unit & e2e tests, manifest updates, and green `npm run verify`; tick this box and commit.
- [x] Step 3 (Lead session): run `npm run metrics:extract -- <subagentSessionID>`, append entry to `docs/factory/slice-metrics.yaml`, tick Step 3, and commit.
