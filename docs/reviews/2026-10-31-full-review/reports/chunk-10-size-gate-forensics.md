# Chunk 10 — File-size gate forensics (adjudicated)

**VERDICT — MIXED per file-class:**

- **`js/**` prod — WORKS + partial GAMING.** ~12 genuine responsibility
  splits; ≥90 %-cap files (viewport, canvas.css, engine, panel.html,
  panel.spec.js, inspector-source.js, trace.js) show two write-arounds:
  chained-ternary data tables folding content into printWidth, and
  comment-thin outliers (inspector-source.js 6.3 %, inspector-state.js
  6.8 % vs median 26.8 %).
- **`test/**`/`e2e/**` — WORKS.** panel.spec.js pinned 450 × 5 commits
  via sibling specs (panel-stage6.spec, fault-console-helpers, etc.),
  never a second split.
- **`css/**` — WORKS, one stall.** canvas.css at 299 × 4 commits.
- **`*.html` — WORKS.** teaching-drawer.js and stage6-registry.js headers
  cite the 550-line panel.html cap as the reason they live in JS.

## Findings

- id: 10-01
  title: Brief-vs-data: viewport.js "extracted 4 times" — actually 2
  severity: Low
  category: documentation
  files: [briefs/chunk-10-size-gate-forensics.md:58]
  evidence: 80dc1b9 — camera.js A 34 lines, orrery-svg.js A 42 lines,
  viewport.js 84+/47-: **two** extractions in one commit. layout.js has
  its own origin (2ad0e93).
  recommendation: Amend brief to "twice (camera + orrery-svg, same commit)".
  deep_dive: no

- id: 10-02
  title: Brief-vs-data: canvas.css "13 commits at 99.7 %" — actually 4
  severity: Low
  category: documentation
  files: [briefs/chunk-10-size-gate-forensics.md:56, css/panel/canvas.css]
  evidence: 13 commits total touched canvas.css; only the last 4
  (fb0cf1a, 7dadca4, 2acf19d, 4fc23f9) are at 299.
  recommendation: Amend brief to "299 × 4 commits since fb0cf1a".
  deep_dive: no

- id: 10-03
  title: 15 extraction pairs classified — 11 genuine, 2 line-neutral, 0 ditches
  severity: Praise
  category: architecture
  evidence: **GENUINE-SPLIT (11):** url-state.js, render-stage.js,
  hop-targets.js, layout-stage6.js, model-stage6.js, model-stage5-chain.js,
  engine-stage6.js, trace-stage6.js, trace-helpers.js, webserver-helpers.js,
  orrery-svg.js — each has a nameable responsibility, zero dead modules.
  **LINE-NEUTRAL (2):** engine-pool.js (65e901e, 33+/33- prettier reflow),
  engine-faults.js (b30d3c6, 11+/18-, real seam).
  **HTML-CAP SPLITS (2):** teaching-drawer.js, stage6-registry.js cite
  the 550-line panel.html cap — pressure transmits across file classes.
  deep_dive: no

- id: 10-04
  title: Comment-thin outliers — inspector-source.js 6.3 %,
  inspector-state.js 6.8 %
  severity: Medium
  category: readability
  files: [js/panel/inspector-source.js, js/panel/inspector-state.js:79-141]
  evidence: Repo prod median 26.8 %; near-gate median 23.6 %.
  inspector-state.js:79-141 — six-branch chained ternary for per-stage
  interface map, self-documenting only if reader knows the stage ladder.
  impact: The exact shape of "write around the gate" — fold content into
  prettier-unbreakable tables, thin comments, ride at 100 %.
  recommendation: Split the per-stage map into a data module or accept
  shape and add a top-of-block narrative. Surface in DESIGN.md.
  deep_dive: no

- id: 10-05
  title: Guard design — two minimal tightening changes, no weakening
  severity: Medium
  category: process
  files: [scripts/guard-file-size.mjs:10-20, scripts/extract-session-metrics.mjs]
  evidence: `scripts/` not in SOURCE_DIRS (:29); extract-session-metrics.mjs
  at 327 lines (109 % of would-be 300). Prettier printWidth:100 blocks
  statement-packing but cannot split long literals — the vector at
  inspector-state.js:79-141.
  recommendation: **(1)** Add `scripts/` to SOURCE_DIRS at 300 — the
  rule's own tooling should live under its own rule. **(2)** SOFT CI
  warning: prod js/css with >N lines over 100 chars — visibility signal,
  not a failure. Do NOT add AST/complexity checks.
  deep_dive: no

- id: 10-06
  title: 3-04 (model↔model-stage6 cycle) and 4-01 (hop-targets false header)
  — gate as context, not cause
  severity: Medium
  category: architecture
  files: [js/panel/model.js:6, js/panel/model-stage6.js:9,
  js/panel/hop-targets.js:4-6]
  evidence: model.js↔model-stage6.js cycle (3-04, today-harmless).
  hop-targets.js header claims pins in render.test.js and
  model-stage6.test.js; grep for `activeHopTarget` across test/panel/
  returns zero matches (4-01). Both headers cite guard-file-size.
  impact: False `PINS:` is a contract violation worse than no pin. Gate
  did not CREATE the defects; the model did during a rushed split.
  recommendation: Add to AGENTS.md: "the new module's header must name a
  real test or omit the pin — never a fabricated reference."
  deep_dive: no

- id: 10-07
  title: Praise — gate prevented monolith drift on the risk files
  severity: Praise
  category: architecture
  files: [js/panel/panel.js, js/sim/engine.js, js/sim/trace.js, panel.html]
  evidence: panel.js 296→285 (url-state.js carved out at 578507c).
  engine.js at 300 (43a6b3d) → engine-stage6.js + engine-pool.js.
  trace.js at 299 (7dadca4) → trace-helpers.js + trace-stage6.js.
  panel.html at 550 → teaching-drawer.js + stage6-registry.js.
  deep_dive: no

- id: 10-08
  title: Praise — precedent chains in headers are self-enforcing
  severity: Praise
  category: documentation
  files: [js/sim/engine-pool.js:2, js/sim/engine-faults.js,
  js/panel/model-dbop.js:3, js/panel/model-stage5-chain.js:3,
  js/sim/webserver-helpers.js:3, js/panel/stage6-registry.js:4]
  evidence: Each new module cites its precedent by name. The model records
  the genealogy of each split — the next split need not re-justify.
  deep_dive: no

## Deep-dive requests (orchestrator dispatch)

None. The only contested judgment (10-06) was adjudicated as "context, not
cause." Brief-vs-data mismatches (10-01, 10-02) resolved against git.

## Bottom line for the repo owner

**Keep, with minimal tightening.** 11/15 genuine seams, 2 line-neutral but
still useful, 0 ditches. Two changes: **(1)** bring `scripts/` into the
scan set at 300; **(2)** soft CI warning for prod files with unusually
many >100-char lines — visibility signal, not a new hard gate.
