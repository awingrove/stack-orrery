# Full Project Code Review — Chunk Map

- **Date:** 2026-10-31
- **Project:** stack-orrery (executable conceptual model of how a web stack works)
- **Method:** 4-phase pipeline — (1) chunk map, (2) per-chunk context briefs by
  researcher sub-agents, (3) per-chunk review reports by Qwen3.7 Plus
  (escalating complex items to Gemini 4 Argon), (4) orchestrator aggregation
  into a ranked overall assessment.
- **Artifacts:** `docs/reviews/2026-10-31-full-review/` —
  `map.md` (this file) → `briefs/chunk-N-*.md` → `reports/chunk-N-*.md` →
  `assessment.md`.

## Reviewer standards

Every reviewer reads `AGENTS.md` and `DESIGN.md` first. Findings are judged
against the repo's own contract, not generic style opinion:

1. **Modeling contract** — `js/sim/**` are executable conceptual models:
   each component's mechanism must be real (e.g. cache hit = actual `Map`
   lookup with tick-based TTL, never `rng() < hitRate`). Trace/UI narratives
   must consume the components' actual messages, never hardcoded stories.
2. **Determinism** — no `Math.random()` / `Date.now()` in `js/sim/**`;
   seeded RNG only (`js/sim/rng.js`); time advances by explicit tick.
3. **Zero runtime dependencies** — browser code is vanilla ESM; no
   framework, bundler, build step. devDeps only.
4. **CSP hygiene** — no inline handlers, inline scripts, or inline styles
   anywhere in HTML/JS/CSS; behavior wired via `addEventListener`.
5. **Slim protocols** — `"GET /path"` requests, `"<status> <body>"`
   responses; every wire token must earn its teaching place; two-number
   mini-IPs (`10.1`) enter only in stages where they teach something.
6. **File-size gates** — prod modules ≤ 300 lines (`js/**`, `css/**`),
   tests ≤ 450, e2e ≤ 450, HTML ≤ 550, briefs ≤ 120. Near-limit files and
   > 300-line `panel.html`/`panel.spec.js`/`fault-console.spec.js`/
   > `index.html`-class outliers get checked for responsibility discipline.
7. **Process contract** — `slices.yaml` + `storymap.yaml` same-change
   freshness, brief-contract tests pinned, DL debt register integrity,
   claim vocabulary (`CHECKS:`/`PINS:`/`DOCUMENTS:`), gate integrity.

## Findings schema (all step-3 reports follow this exactly)

Each finding:

```yaml
- id: N-xx              # chunk number + sequence (e.g. 2-03)
  title: <one line>
  severity: Critical | High | Medium | Low | Praise
  category: logic | code-quality | readability | architecture |
             SOLID | DRY | YAGNI | process | test-contract | documentation
  files: [path:line, ...]
  evidence: <what is actually in the code; quote the load-bearing line(s)>
  impact: <what it damages: correctness, maintenance, teaching value,
           future development>
  recommendation: <concrete change>
  deep_dive: <yes/no; if yes, what was escalated and to which model>
```

Severity meaning:

- **Critical** — breaks the correctness contract: determinism violation,
  probability-faked mechanism, trace narrative not sourced from real
  messages, stale manifest pinning wrong behavior, CSP-violating inline code.
- **High** — damages ongoing maintenance, extensibility, or the teaching
  contract's reachability even without an outright correctness break.
- **Medium** — quality/readability debt a maintainer will pay for.
- **Low** — polish. **Praise** — load-bearing work done right worth naming.

## Chunks

| #   | Name              | Purpose / risk charter                                                                      |            Lines |
| --- | ----------------- | ------------------------------------------------------------------------------------------- | ---------------: |
| 1   | Sim core          | Tick loop, determinism, transport, trace plumbing — the contract every other layer rides on |           ~1,320 |
| 2   | Sim components    | Stage 1–6 components; mechanism realism vs modeling rules                                   |           ~1,480 |
| 3   | Panel state       | App state/view-model layer; mirrors sim; stage layering discipline                          |             ~820 |
| 4   | Panel render      | Geometry, SVG, rendering pipeline                                                           |           ~1,500 |
| 5   | Panel interaction | Teaching/mission/fault UX; read/verify                                                      |           ~2,100 |
| 6   | Unit tests        | What the tests pin vs miss; assert quality, contract fidelity                               |            5,245 |
| 7   | E2E + CSS + HTML  | Browser contracts, visual system, CSP surface                                               |            4,363 |
| 8   | Tooling           | Guards are the repo's immune system; verify they bite                                       |            1,401 |
| 9   | Factory process   | Briefs vs realized code; manifests, ledgers, debt register                                  | ~8,900 doc lines |

### Chunk 1 — Sim core

- Files: `js/sim/engine.js` (298), `trace.js` (294), `trace-stage6.js`
  (256), `trace-helpers.js` (103), `network.js` (88), `router.js` (90),
  `browser.js` (89), `browser-seat.js` (25), `users.js` (64), `rng.js` (12)
- Charter: the tick loop is the project's heartbeat. Deadlock/livelock,
  event-ordering determinism, RNG seeds, transport realism (deliver/not-S,
  routing vs hosts), trace as an audit trail of _actual_ messages. Also
  whether `trace-stage6.js`/`engine-stage6.js` duplicate engine/trace rather
  than extending them.

### Chunk 2 — Sim components

- Files: `webserver.js` (299), `webserver-helpers.js` (69), `database.js`
  (191), `cache.js` (142), `cdn.js` (119), `cdn-chain.js` (197),
  `loadbalancer.js` (149), `queue.js` (181), `dns.js` (172),
  `engine-faults.js` (69), `engine-pool.js` (35), `engine-stage6.js` (56)
- Charter: mechanism realism is the product. Cache = real `Map` + tick TTL;
  queue = real enqueue/dequeue ordering; DB = real primary/replica failover;
  DNS = real ledger of records; CDN edge/bypass = real request-path hops.
  Slim-protocol compliance; two-number IPs; bootstrapping `engine-stage6.js`
  without duplicating `engine.js`; `engine-faults` fault-injection design.

### Chunk 3 — Panel state

- Files: `model.js` (250), `model-stage5-chain.js` (69),
  `model-stage6.js` (82), `model-dbop.js` (24), `stage6-registry.js` (128),
  `url-state.js` (29), `inspector-state.js` (235)
- Charter: the state view-model mirrors sim outputs. Is the mirror derived
  or hand-copied? Stage-4/5/6 addenda (`model-stage5-chain`, `model-stage6`,
  `model-dbop`) — extension vs bolt-on pattern; `stage6-registry.js` design;
  URL-state; inspector state coherence with the real model.

### Chunk 4 — Panel render

- Files: `render.js` (262), `render-stage.js` (141), `layout.js` (287),
  `layout-stage6.js` (72), `layout-geo.js` (40), `orrery-svg.js` (42),
  `hop-targets.js` (197), `camera.js` (101), `viewport.js` (300)
- Charter: geometry for real component/edge positions (is it derived from
  the sim graph, or hardcoded per stage?), SVG building, plane/orrery
  camera math aliasing, render stage-splitting discipline, and whether
  render actually consumes real messages instead of stage stories.

### Chunk 5 — Panel interaction

- Files: `panel.js` (285), `teaching.js` (181), `teaching-drawer.js` (99),
  `missions.js` (280), `missions-view.js` (104), `fault-console.js` (296),
  `compare.js` (99), `fs-editor.js` (216), `inspector-source.js` (270),
  `inspector-source-stage6.js` (122), `journey-log.js` (62), `rail.js` (127)
- Charter: all user-facing teaching surfaces; narratives must be keyed to
  real outgoing messages, not hardcoded stories (DL-1/DL-3 class defects).
  `caveman`-level editability; event listeners wired externally (no inline);
  read/verify closure. File-source correctness; compare/`fs-editor`
  correctness; rail/camera drawer consistency.

### Chunk 6 — Unit tests

- Files: `test/sim/*.test.js` (16 files, ~3,000 lines),
  `test/panel/*.test.js` (10 files, ~2,245 lines), per earlier listing
- Charter: reviews the test suite as load-bearing. What contract does each
  suite pin; assert quality (behavioral `expect`s vs smoke tests); how much
  of the modeling contract has a pin; gaps/skips/absent tests; consistency
  with real message shapes rather than incidental strings; test
  cut discipline.

### Chunk 7 — E2E + CSS + HTML

- Files: `e2e/*.spec.js` + helpers (16 files, 2,463 lines — some way over
  the 450 gate, `panel.spec.js` 450 exactly, `fault-console.spec.js` 417),
  `css/**` (8 files, 1,435), `panel.html` (548), `index.html` (141)
- Charter: e2e walks real user journeys vs pixel/snapshot traps; CSS
  structure, layering, and coverage; inline CSP violations; HTML page
  responsibility (`panel.html` at 548 — is that monolithic responsibility?).

### Chunk 8 — Tooling

- Files: `scripts/*.mjs` (11 files, 1,401), `eslint.config.js` (36),
  `.github/workflows/ci.yml` (81), `package.json`,
  `.githooks/pre-commit`, `factory-kit` integration points referenced by
  `AGENTS.md`
- Charter: guards are the repo's immune system; verify each guard bites
  (file-size guard, plan-tick guard, metrics guard, debt guard, slices
  guard, story refs, claims) and that the CI = `npm run verify` gate
  contract is faithful to it in CI; static-server CSP headers; measuring
  extraction scripts robustness. Guard bypass/discipline risk.

### Chunk 9 — Factory process audit

- Files: `docs/plans/*.md` (23 briefs), `docs/factory/slice-metrics.yaml`,
  `docs/factory/technical-debt.yaml`, `slices.yaml`, `storymap.yaml`,
  `AGENTS.md`, `DESIGN.md`, `FACTORY.md`, `README.md`
- Charter (full audit): across stages spot-check brief _boundary contracts_
  vs realized code (exports, test IDs, DOM `data-testid`s, negative-case
  contracts present — the DL-3/DL-4 class), manifest same-change freshness,
  and every story's test ref actually existing and pinning the stage's
  behavior; DL register entries: still-present debts, entries not captured;
  metrics ledger entry/edge cases (guardrail_failures, telemetry presence);
  whether proportions/timings of `docs/factory` hold together; whether the
  briefs' own discipline (≤120 lines, no ghost-coding) was held.

## Phase dispatch plan

- **Step 2 (9 researcher sub-agents, parallel, `explore`):** one per chunk,
  output `briefs/chunk-N-<name>.md` (≤120 lines): layer map, exports and
  dependencies, contract touchpoints, risk hotspots, counts/facts, file
  sizes and ownership, test pins relevant to this chunk. Briefs state facts
  and risk charter, not judgments.
- **Step 3 (9 reviewer sub-agents, one per chunk, `opencode-go/qwen3.7-plus`):**
  each reads `AGENTS.md` + `DESIGN.md` + its brief + the actual file list,
  and produces `reports/chunk-N-<name>.md` in the findings schema above.
  Every finding must quote actual source lines as evidence. If evaluation
  gets complex, `[[DEEP-DIVE]]` to `opencode-go/gemini-4-argon` where
  runtime-side delegation is possible; otherwise the report lists
  `deep_dive: yes` items for orchestrator dispatch.
- **Step 4 (orchestrator):** read all 9 reports, de-duplicate cross-chunk
  findings (same root cause, multiple symptoms), producing one aggregated
  report, `docs/reviews/2026-10-31-full-review/assessment.md`, ranked
  Critical→Low plus Worth-praising.
