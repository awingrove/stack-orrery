# Chunk 7 — E2E + CSS + HTML — Review Report

- **Reviewer:** qwen3.7-plus
- **Date:** 2026-10-31
- **Charter:** browser-contract quality (e2e walks real user journeys vs pixel-fragile DOM traps); CSS architecture, token discipline, selector hygiene; HTML semantic structure + CSP surface.
- **Scope reviewed:** 15 spec files (2,434 LOC) + `e2e/fault-console-helpers.js` (29) + `playwright.config.js` (21); 8 CSS files (1,435 LOC); `panel.html` (548) + `index.html` (141).
- **Brief-vs-code verification:** brief's LOC counts, selector tallies, and inline-scan zeros all match the on-disk files. No brief-vs-code mismatch found.

---

## Findings

```yaml
- id: 7-01
  title: panel.spec.js is exactly at the 450-line gate — no headroom, single-line changes force a split
  severity: High
  category: architecture
  files: [e2e/panel.spec.js:1-450]
  evidence: |
    $ wc -l e2e/panel.spec.js → 450
    AGENTS.md line 28: "test suites (test/**, e2e/**) over 450 lines … fail scripts/guard-file-size.mjs"
  impact: >
    The file aggregates queue-depth overload, per-stage traces (Stages 1-5),
    legend drawer, title-attr a11y, deep-link, stage-fallback, and SERVED card
    — seven distinct responsibilities in one spec. Any new assertion (a Stage-6
    headline pin, a new control-title check, a SERVED-card edge case) forces a
    split under gate pressure rather than on responsibility lines. The file
    already mixes "walk the overload story" (lines 7-37), "stage-by-stage
    trace ladder" (86-332), and "misc a11y / deep-link pins" (334-449) — three
    distinct concerns, one cap.
  recommendation: >
    Split panel.spec.js by responsibility before the next feature lands:
    (a) overload-story (queue depth + latency + served tally), (b) stage-ladder
    (Stage 1-5 traces, one test per stage, which today is ~250 lines alone),
    (c) panel-hygiene (title attrs, deep-link, fallback, SERVED card). Each
    stays well under 450 and the split is on responsibility, not line count.
  deep_dive: no

- id: 7-02
  title: panel.html (548/550) and canvas.css (299/300) share the same 1-2-line headroom hazard
  severity: High
  category: architecture
  files: [panel.html:1-548, css/panel/canvas.css:1-299]
  evidence: |
    $ wc -l panel.html css/panel/canvas.css
      548 panel.html
      299 css/panel/canvas.css
    js/panel/rail.js lines 10-11: "Rail chrome is JS-built because panel.html
    sits at its 550-line cap; the static #legend-panel is the one moved node"
  impact: >
    Any new static node — a Stage 7 component, a second wire column, a new HUD
    widget — has nowhere to land in panel.html without triggering a split or
    going JS-built (fragmenting the HTML contract the e2e specs walk).
    canvas.css's node-card/wire-column chrome (lines 206-279) is already a
    candidate to move into nodes.css, which was explicitly split "by
    responsibility" but still carries the card's outer shell. One added rule
    forces the same decision under pressure.
  recommendation: >
    Proactively move the node-card / node-head / ip-chip / code-chip /
    wire-column / wire-lane / lane-active rules from canvas.css (lines 206-296,
    ~90 lines) into nodes.css — the card is a node, the wire column is node
    furniture, and nodes.css has ~100 lines of headroom. Reassess panel.html
    the same way: the seven static article.node-card blocks (193-491, ~300
    lines) are a single responsibility (the canvas's static topology), and
    could be JS-built by a new `topology.js` on the same mount pattern as
    rail.js — but only when Stage 7 is designed; until then, leave it.
  deep_dive: no

- id: 7-03
  title: panel.css hardcodes #061224 for button text instead of the existing --on-accent token
  severity: Medium
  category: code-quality
  files: [css/panel/panel.css:61, css/shell/base.css:11]
  evidence: |
    css/panel/panel.css:56-64:
      button {
        padding: 0.45rem 0.95rem;
        border: none;
        border-radius: 0.3rem;
        background: var(--accent);
        color: #061224;         /* hardcoded — token exists */
        font-weight: 600;
        cursor: pointer;
      }
    css/shell/base.css:11:  --on-accent: #061224;
  impact: >
    Token drift: the shell defines `--on-accent` for exactly this usage, the
    DESIGN.md front-matter names the pair, and one rule bypasses it. A future
    palette change (or dark/light theme variant) would miss this spot. It is
    also a DESIGN.md "no colors outside the front-matter palette without
    amending this file" (line 498) soft violation — the color IS in the
    palette, the rule just does not reference it.
  recommendation: 'Replace `color: #061224;` with `color: var(--on-accent);`.'
  deep_dive: no

- id: 7-04
  title: base.css uses !important on .brand — a specificity hammer the token system should not need
  severity: Medium
  category: code-quality
  files: [css/shell/base.css:60]
  evidence: |
    css/shell/base.css:48-56, 58-61:
      .site-nav a { color: var(--text-muted); text-decoration: none; }
      .site-nav a:hover,
      .site-nav a[aria-current='page'] { color: var(--text); }
      .brand { font-weight: 700; color: var(--text) !important; }
  impact: >
    `.brand` needs to beat `.site-nav a[aria-current='page']` on index.html
    (where it carries `aria-current='page'`) and on panel.html (where it does
    not). The `!important` wins regardless, but it trains future authors to
    reach for the same hammer for every nav-link override. Two cleaner
    solutions exist: (a) add `.brand` to the existing selector
    (`.site-nav a.brand, .site-nav a[aria-current='page']`), (b) let the
    `aria-current` rule apply — `.brand` already has `color: var(--text)`
    which matches the hover/current color anyway, so the rule is almost
    redundant.
  recommendation: >
    Drop `!important` and let `.site-nav a[aria-current='page']` (already
    `var(--text)`) color the brand on index.html; on panel.html where it is
    not current, `.site-nav a` alone is `var(--text-muted)` — if the brand
    must stay `var(--text)` on both pages, add a single
    `.site-nav a.brand { color: var(--text); }` line below the current rules
    with no `!important`.
  deep_dive: no

- id: 7-05
  title: fault-console pattern repeats three-phase mission-latch tests across stages 1-6 with near-identical shape
  severity: Low
  category: DRY
  files:
    - e2e/fault-console.spec.js:119-145
    - e2e/fault-console.spec.js:251-273
    - e2e/fault-console.spec.js:381-416
    - e2e/fault-console-stage4.spec.js:106-133
    - e2e/fault-console-stage5.spec.js:120-159
    - e2e/panel-stage6.spec.js:266-303
  evidence: |
    Each stage carries a "verify the stage-N mission only after <phase 1> and
    <phase 2>" test with the same shape:
      - open missions rail
      - assert initial chip readout (○ <metric>: 0 · ...)
      - toggle fault, run phase 1, assert chip moved but NOT ✓
      - restore, run phase 2, assert ✓ done · tick \d+
    fault-console-helpers.js extracts selectors (faultsTab, missionChip,
    traceWith) but not the three-phase meta-pattern itself.
  impact: >
    Six tests, ~150 LOC, same skeleton. Each stage's metric is genuinely
    different (`refusals`, `skips`, `bypassed`, `failed writes`, `redelivered`,
    `dropped`), so the repetition is not pure duplication — but the harness
    (open rail, initial read, phase-1-not-done, phase-2-done) is. A new
    Stage-7 fault will mint a seventh copy.
  recommendation: >
    Add a `assertMissionLatch(page, { metric, phase1, phase2 })` helper in
    fault-console-helpers.js that captures the four-step shape; each spec
    keeps its stage-specific setup but the harness lives in one place. Low
    priority — the current shape is readable and under the gate — but worth
    doing before Stage 7.
  deep_dive: no

- id: 7-06
  title: All 15 specs are flat test() calls with no test.describe grouping — responsibility grouping lives only in filenames
  severity: Low
  category: readability
  files: [e2e/*.spec.js]
  evidence: |
    $ grep -c "test.describe" e2e/*.spec.js → every file: 0
    62 tests total (brief confirmed); each test() is a top-level call with a
    long self-describing title.
  impact: >
    Playwright's HTML report and `--grep` filter group by `test.describe`
    blocks; flat tests list 62 rows in one bucket per file. The long titles
    ("should switch to Stage 4, write to Primary 10.30 on POST, observe
    replica lag on GET, and inspect database code") compensate but are
    themselves a readability cost — any one title is a short paragraph.
  recommendation: >
    Keep the flat shape (the titles ARE the contract pins — "Titles are
    manifest pins — do not reword" appears in every spec's header comment),
    but consider a single top-level `test.describe` per file naming the
    slice (e.g. `test.describe('Stage 4 DB + Replication traces', () => {…})`)
    so reports group meaningfully without forcing title rewrites. Optional.
  deep_dive: no

- id: 7-07
  title: playwright.config.js pins chromium only — no WebKit/Firefox coverage
  severity: Low
  category: test-contract
  files: [playwright.config.js:15]
  evidence: |
    playwright.config.js:15:
      projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  impact: >
    The project's contract is "static ESM + standard Web APIs" — nothing
    chromium-specific is used on inspection (no chromium-only APIs in js/**).
    But there is no verification. WebKit would catch any Safari CSS
    assumptions (e.g. `overflow-wrap: anywhere`, `overscroll-behavior`) and
    Firefox would catch any `:has()` or grid-edge differences. Low impact
    because the user base is learners on any modern browser; still a gap.
  recommendation: >
    Add WebKit as a second project in playwright.config.js (one line:
    `{ name: 'webkit', use: { ...devices['Desktop Safari'] } }`). Firefox is
    lower priority. Run in CI only if green; skip if it flakes.
  deep_dive: no

- id: 7-08
  title: Zero inline CSP violations verified in HTML/JS/CSS — surface is clean
  severity: Praise
  category: process
  files: [panel.html, index.html, css/**]
  evidence: |
    grep -c "style=" panel.html index.html → 0 / 0
    grep "on[a-z]+=" *.html → 0 hits (only false positives: meta viewport,
      aria-controls, data-component)
    grep "<style>" *.html → 0 hits
    grep "<script>" *.html → 0 hits (panel.html:546 carries src=)
    scripts/static-server.mjs lines 29-30 ship `script-src 'self';
      style-src 'self'` headers.
  impact: >
    The CSP surface is load-bearing: the whole educational contract rides on
    "no inline scripts, no inline styles, no event handlers." The zero-count
    scan is the contract's evidence.
  recommendation: None. Hold the line.
  deep_dive: no

- id: 7-09
  title: testid discipline across 62 tests is exceptional — every sim-facing assertion reads real state
  severity: Praise
  category: test-contract
  files: [e2e/*.spec.js]
  evidence: |
    e2e/panel.spec.js:11  — `await expect(page.getByTestId('user-dots').locator('> *')).toHaveCount(5);`
    e2e/panel.spec.js:51  — `await expect(page.getByTestId('exchange-inspector')).toHaveText('10.6 -> 10.1 GET /about => 200 This is the about page');`
    e2e/fault-console.spec.js:75 — `await expect(page.getByTestId('hop-status')).toContainText('connection refused');`
    e2e/fault-console-stage5.spec.js:101 — `await expect(page.getByTestId('hop-status')).toContainText('Worker (10.41) crashed — 1 job(s) waiting in the queue (nothing committed)');`
    e2e/panel-stage6.spec.js:141 — `'Hop 2/2: DNS (10.60) -> Browser (10.2): NX no record — no GET emitted'`
    e2e/missions.spec.js:65 — `await expect(chipOf(page, 'Get a 404')).toContainText('○');`
    e2e/compare.spec.js:34 — `expect(await cellText(page, 4, 'left')).toBe('10.11 -> 10.2 | 200 This is the about page (MISS)');`
  impact: >
    Every assertion is a browser-contract assertion (count, text, regex) on a
    real data-testid, never on a pixel snapshot or a DOM shape that can drift
    without breaking behavior. The whole suite is resilient to CSS rewrites
    and HTML reshuffles that preserve testids. This is exactly what
    browser-contract e2e should look like.
  recommendation: None — point at this chunk when the next project asks
    "what does good e2e look like."
  deep_dive: no

- id: 7-10
  title: Every fault-console spec pins its DL-3/DL-4 counter-example — the sim-is-the-referee contract is closed
  severity: Praise
  category: test-contract
  files:
    - e2e/fault-console.spec.js:221-232
    - e2e/fault-console-stage4.spec.js:86-103
    - e2e/fault-console-stage5.spec.js:103-117
    - e2e/panel-stage6.spec.js:231-263
    - e2e/missions.spec.js:55-70
    - e2e/cdn-edge.spec.js:135-162
  evidence: |
    fault-console.spec.js:221-227 — LB skip narrates without aborting the
    served story; `connection refused` count pinned to 0.
    fault-console-stage4.spec.js:89 — `Database WRITE /about` hasCount(0);
    the healthy-write sentence is provably absent during primary-down.
    fault-console-stage5.spec.js:106 — `finished job and committed`
    hasCount(0) while the worker is crashed; the commit sentence a healthy
    tail carries is provably absent.
    panel-stage6.spec.js:263 — NX run carries no GET frame.
    missions.spec.js:65-66 — 405 (wrong method) does not complete the 404
    mission (named counter-example).
    cdn-edge.spec.js:159-162 — POST to cd.example.com leaves the fill ledger
    empty and counters at zero (the POST-pass-through counter-example).
  impact: >
    Every fault's "this is NOT a <other fault>" is pinned. The sim-is-the-
    referee contract (DESIGN.md Fault Console; AGENTS.md "never fake a
    component's mechanism with probabilities") is closed on every branch.
  recommendation: None. This is the load-bearing pattern.
  deep_dive: no

- id: 7-11
  title: CSS architecture is cleanly layered — shell tokens, one file per responsibility, every file header-cross-references its own slice
  severity: Praise
  category: architecture
  files:
    [
      css/shell/base.css,
      css/panel/panel.css,
      css/panel/canvas.css,
      css/panel/nodes.css,
      css/panel/inspector.css,
      css/panel/teaching.css,
      css/panel/rail.css,
      css/panel/faults.css,
    ]
  evidence: |
    Each file opens with a responsibility comment:
      canvas.css:1   — "Orrery plane viewport (PANEL slice)…"
      nodes.css:1    — "Node internals (PANEL slice, split from canvas.css by responsibility)…"
      inspector.css:1 — "Panel inspector styles (PANEL slice)…"
      teaching.css:1 — "Teaching drawer (Stage R1: docked into .rail's teach host…)…"
      rail.css:1     — "Control-room rail (Stage R1 brief…)…"
      faults.css:1   — "B-6 fault console (fourth rail tab…)…"
    Every file consumes tokens via var(--*) only; DESIGN.md's front-matter
    tokens (`--bg`, `--surface`, `--border`, `--text`, `--accent`, `--good`,
    `--warn`, `--danger` + their `-soft` pairs + `--mono`) are defined once
    in base.css:3-19 and consumed uniformly.
  impact: >
    A new UI pattern lands in exactly one file; a palette change edits one
    :root block; a new stage's components go in nodes.css/canvas.css without
    touching teaching/faults/rail. The split is responsibility-driven and
    each file is well under the 300-line gate (the highest is canvas.css at
    299 — see 7-02).
  recommendation: None. Hold the layering.
  deep_dive: no

- id: 7-12
  title: panel.html's semantic structure is readable — a single <main>, proper aria-labels, every interactive control has a title attribute
  severity: Praise
  category: readability
  files: [panel.html]
  evidence: |
    panel.html:48  <main class="container">
    panel.html:49  <section class="control-strip" aria-label="Simulation controls">
    panel.html:50    <div class="control-group trace-controls" aria-label="Single request trace">
    panel.html:69    <div class="control-group crowd-controls" aria-label="Client browsers">
    panel.html:98  <div id="orrery-viewport" … aria-label="Orrery plane viewport" tabindex="0">
    panel.html:176 <section id="orrery-world" … aria-label="Simulated stack">
    panel.html:514 <section class="bottom-panels" aria-label="Inspectors">
    panel.html:515 <div class="inspector-card" aria-label="Component code and state inspector">
    panel.html:537 <div class="log-card" aria-label="Wire journey log">
    panel.html:494 <dl class="stats" aria-label="Live state">
    panel.spec.js:395-413 — "should give every trace, camera, and load
    control a non-empty title" — 8 controls verified.
  impact: >
    The aria-labels make the page navigable by screen reader and the title
    attributes make it self-describing by hover (DESIGN.md Do rule: "the
    learner should never have to guess"). The e2e pins the title attribute
    contract by id, so any future control that forgets a title is a failing
    test.
  recommendation: None. Hold the contract.
  deep_dive: no
```

## Deep-dive requests (orchestrator dispatch)

None required — the chunk's verdicts all fit within the reviewer's confidence band without escalation. The file-size headroom questions (7-01, 7-02) are load-bearing but do not need a second model to judge; the token-drift (7-03) and `!important` (7-04) findings are textually obvious; the DRY (7-05) and describe-block (7-06) findings are taste calls, not correctness; the test-contract praise items (7-08, 7-09, 7-10, 7-11, 7-12) are supported by quoted evidence.

## Summary by severity

- **Critical:** 0
- **High:** 2 (7-01 panel.spec.js exactly at gate; 7-02 panel.html/canvas.css headroom hazard)
- **Medium:** 2 (7-03 token drift #061224; 7-04 !important on .brand)
- **Low:** 3 (7-05 fault-console meta-pattern DRY; 7-06 no test.describe; 7-07 chromium-only config)
- **Praise:** 5 (7-08 clean CSP surface; 7-09 testid discipline; 7-10 DL-3/DL-4 counter-example closure; 7-11 CSS layering; 7-12 HTML semantics + title-attribute contract)

## Top findings

1. **High (7-01, 7-02):** Three files are at or within 1-2 lines of their gates — `panel.spec.js` (450/450), `panel.html` (548/550), `canvas.css` (299/300). Each is a single responsibility worth splitting, not an emergency, but the next feature in any of them forces a gate-driven refactor rather than a planned one. Panel.spec.js's seven mixed responsibilities (overload story, per-stage traces, a11y, deep-link, fallback, SERVED card) are the clearest case.
2. **Medium (7-03, 7-04):** Two token-discipline slips in the CSS — `#061224` hard-coded where `var(--on-accent)` exists, and `.brand` uses `!important` where a slightly tighter selector would do. Neither is a correctness issue; both are polish.
3. **Praise (7-09, 7-10):** The e2e suite's load-bearing work — 62 tests walking real user journeys against real sim state, every DL-3/DL-4 counter-example pinned, zero pixel snapshots, zero inline CSP violations. The `sim-is-the-referee` contract is closed on every fault branch.
