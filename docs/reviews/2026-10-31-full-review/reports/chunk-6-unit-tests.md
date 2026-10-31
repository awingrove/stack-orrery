# Chunk 6 — Unit tests — Review Report

- **Reviewer:** Qwen3.7 Plus (`opencode-go/qwen3.7-plus`)
- **Date:** 2026-10-31
- **Scope:** `test/sim/*.test.js` (16), `test/panel/*.test.js` (10); ~5,245 lines.
- **Charter:** What each suite pins vs rehearses; assertion strength; B-6 fault-suite discipline (fail-loud / fault branch / restore / byte-identical same-seed replay); coverage gaps; suite design quality (factories, determinism, naming, DRY, size).

---

## Summary

The test corpus is the project's load-bearing contract surface and it reads like one: whole-frame `toEqual([...])` over full narrated frames, byte-identical same-seed replay across every fault suite, named DL-3 counter-examples that genuinely pin the _absence_ of invented tokens, and hand-built snapshot literals in panel suites that mirror real engine snapshot shapes rather than being copy-pasted. Determinism hygiene is spotless (no `vi.*`, no fake timers, no `Math.random`/`Date.now`, no `it.skip`/`todo`/`TODO` — all confirmed via ripgrep). The 6 B-6 fault suites do genuinely pin fail-loud, fault-branch, restore, and byte-identical replay, with one small asymmetry in `loadbalancer-failover` (see 6-02).

The real risk is at the edges: 17 panel modules (including `fault-console.js`, `fs-editor.js`, `viewport.js`, `url-state.js`, `stage6-registry.js`) have no direct unit file and ride e2e for coverage; several sim core modules (`trace.js`, `trace-stage6.js`, `trace-helpers.js`, `engine-faults.js`, `engine-pool.js`, `engine-stage6.js`, `cdn-chain.js`) are exercised only through the engine surface; and `render.test.js` actually tests `model.js` ordering helpers — a naming/readability wart that will bite a maintainer. File-size discipline is excellent: largest suite is 421 lines, all under the 450 gate, with `camera.test.js` (406 lines, 5 `it()` blocks) and `missions.test.js` (421) flagged for the maintainer's re-learn cost.

Brief-vs-code verification: the researcher's claims held up under spot-check. Every factual count and line-pin cited in the brief was confirmed in the suites (whole-frame assertions, fail-loud error regexes, DL-3 verbatim titles, no skips/todos, the render.test.js naming mismatch, camera's 5-its/406-lines shape). No brief-vs-code mismatches found.

---

## Findings

```yaml
- id: 6-01
  title: render.test.js imports model.js, not render.js — file name lies about its target
  severity: Medium
  category: readability
  files: [test/panel/render.test.js:2]
  evidence: >
    Line 2: `import { journeyEntryIsBefore, orderJourneyEntries } from '../../js/panel/model.js';`
    The suite-header comment at line 5-7 acknowledges this:
    "the renderer's #journey-log ordering — render.js itself is DOM-bound …
    so the node unit suite pins the pure ordering contract it consumes from model.js."
  impact: >
    A maintainer looking for render.js's unit contract will land here and find model.js
    ordering helpers instead. The test IS load-bearing — it pins the hop-ordering contract
    the renderer consumes — but the file name hides that, and the real render.js has no
    direct unit surface (DOM-bound). storymap.yaml references test titles, not file names,
    so the title pins survive, but the discoverability cost is real.
  recommendation: >
    Rename to test/panel/journey-ordering.test.js (or move the helpers into a dedicated
    js/panel/journey-order.js so the file name matches what is tested). Either way, the
    suite-header comment already does the right DOCUMENTS work — bake it into the file
    name so a grep for render tests does not mislead.
  deep_dive: no

- id: 6-02
  title: loadbalancer-failover same-seed replay omits the toggle-no-residue check every other fault suite carries
  severity: Low
  category: test-contract
  files: [test/sim/loadbalancer-failover.test.js:167-184]
  evidence: >
    The stage-2 replay is:
      const run = () => { ...; return Array.from({ length: 50 }, () => engine.step()); ... };
      expect(run()).toEqual(run());
    Contrast with cache-bypass.test.js:183-199 and worker-crash.test.js:319-333, which both
    additionally run `engine.setFault(true); engine.setFault(false);` inside a `toggleRun`
    closure and assert `toggleRun() === first`. loadbalancer-failover has only the plain
    `run() === run()` equality.
  impact: >
    Minor asymmetry: the LB fault wiring cannot be proven to leave no residue on a flip-
    on-then-straight-off. The plain replay still pins determinism, and the skip-tally/
    refusal pins at lines 25-51 and 76-111 cover the faulted path, so the regression
    surface is small — but it is the one B-6 suite where the DL-2 "what you do not demo,
    the human discovers" rule has a gap.
  recommendation: >
    Add a `toggleRun` mirror that calls `setServerDown('10.11', true)` then
    `setServerDown('10.11', false)` inside the run and asserts `toEqual(first)`. This
    closes the symmetry with the other five fault suites at ~10 lines.
  deep_dive: no

- id: 6-03
  title: B-6 fault suites' DL-3 counter-examples are substantive — whole-frame byte-identical equality, not smoke
  severity: Praise
  category: test-contract
  files:
    - test/sim/dns-ledger-drop.test.js:210-236
    - test/sim/primary-down.test.js:219-247
    - test/sim/worker-crash.test.js:242-313
    - test/sim/cache-bypass.test.js:153-181
    - test/sim/webserver-fault.test.js:161-176
  evidence: >
    dns-ledger-drop:223-224 normalizes the host token and compares frames:
      const normalize = (frames) => frames.map((f) => f.replace(/who is \S+\?/, 'who is <host>?'));
      expect(normalize(droppedRun.frames)).toEqual(normalize(unknownRun.frames));
    worker-crash:256 slices 0..7 and asserts byte-identity of the enqueue frames.
    primary-down:231 does full `expect(on.frames).toEqual(off.frames)` with the entire
    7-frame list pinned. cache-bypass:171-172 pins the BYPASS token stays distinct from
    BYPASSED AND the origin tally does not move for the non-GET. webserver-fault:161-176
    pins lastExchange, lastMatchedRoute, and browserDisplay all null across a refusal.
  impact: >
    These are the teaching contract's load-bearing pins — a regression that invents a new
    fault narration token, or reuses a served status for a refused request, fails loudly
    here. The DL-3 discipline is real, not decorative.
  recommendation: Keep. Worth preserving as a pattern doc for future B-7+ fault suites.
  deep_dive: no

- id: 6-04
  title: Sim suites assert whole-frame/whole-record shapes — not string-smoke pockets
  severity: Praise
  category: test-contract
  files:
    - test/sim/engine.test.js:70-90
    - test/sim/dns-ledger-drop.test.js:85-110
    - test/sim/worker-crash.test.js:65-71
  evidence: >
    engine.test.js:70-83: a full 9-frame `expect(frames).toEqual([...])` with every frame
    pinned verbatim — DNS ask/answer prelude, the stage-5 chain shifted +2, no post-answer
    DNS token, no pre-answer GET frame.
    dns-ledger-drop.test.js:88-100: whole lookup records `toEqual({ status: 'NX', name, source })`
    plus `lastLookup` record and counter projections.
    worker-crash.test.js:65-68: `pendingJobs` asserted as a byte-identical array of full
    queued-shape records.
  impact: >
    A regression that alters ANY frame, adds a hop, drops a counter, or reshapes a record
    fails here. The teaching model's wire vocabulary is pinned end-to-end, not just the
    happy-path line.
  recommendation: Keep. This is the assertion-quality discipline the project was built on.
  deep_dive: no

- id: 6-05
  title: Determinism hygiene is spotless — no fake timers, no RNG coupling, no Math.random/Date.now anywhere in test/
  severity: Praise
  category: test-contract
  files: [test/]
  evidence: >
    ripgrep `Math\.random|Date\.now` over test/: 0 matches.
    ripgrep `vi\.|useFakeTimers|mockFn`: 0 matches.
    ripgrep `it\.skip|describe\.skip|\.todo|TODO`: 0 matches.
    Every seed is an explicit literal (7, 8, 42) and every step count is a hard count.
  impact: >
    Tests can run in any order, in parallel, on any day, and the same-seed replay pins
    stay meaningful. This is the load-bearing condition that makes the whole suite a
    reliable spec of the modeling contract.
  recommendation: Add to DESIGN.md or AGENTS.md as an explicit "tests" rule (the existing
    determinism rule covers js/sim but not test/). One-line addition.
  deep_dive: no

- id: 6-06
  title: camera.test.js packs 406 lines into 5 `it()` blocks — large ring-geometry literal blocks dominate
  severity: Medium
  category: code-quality
  files: [test/panel/camera.test.js:111-406]
  evidence: >
    Lines 111-406 of a 406-line file are large `expect(coords).toEqual([...])` blocks
    asserting the full ring-coordinate list and stage-bbox geometry for the orrery. The
    brief notes "5 `it()` blocks across 406 lines — large ring-geometry literal
    expectation blocks." 406 is under the 450 gate but close enough that adding a new
    ring or tweaking the stage-bbox shape will force a split.
  impact: >
    When layout.js changes shape, a maintainer must re-learn which block of 80+ literal
    coordinates to update. The assertions ARE load-bearing (full ring-coordinate arrays,
    not smoke), but the DRY cost is high: any geometry tweak touches many literal lines.
  recommendation: >
    Consider splitting the stage-4 orrery geometry (currently one large `it`) into a
    per-ring describe, OR extract the expected coordinate arrays into a small
    `test/panel/fixtures/orrery-stage4.js` so the test reads against a named fixture.
    Either keeps it under 450 without the split-pressure of the current shape.
  deep_dive: no

- id: 6-07
  title: 17 panel modules have no direct unit file — some hide real logic (fault-console, fs-editor, viewport, url-state)
  severity: High
  category: architecture
  files:
    - js/panel/fault-console.js
    - js/panel/fs-editor.js
    - js/panel/viewport.js
    - js/panel/url-state.js
    - js/panel/stage6-registry.js
    - js/panel/inspector-source.js
    - js/panel/inspector-source-stage6.js
    - js/panel/rail.js
    - js/panel/hop-targets.js
    - js/panel/render-stage.js
  evidence: >
    28 panel modules, 10 unit-tested. `render.js`, `fault-console.js`, `fs-editor.js`,
    `viewport.js`, `url-state.js`, `inspector-source.js`, `inspector-source-stage6.js`,
    `journey-log.js`, `missions-view.js`, `model-dbop.js`, `orrery-svg.js`, `panel.js`,
    `rail.js`, `render-stage.js`, `stage6-registry.js`, `teaching-drawer.js`,
    `layout-geo.js` all lack direct unit files. The e2e suite walks real user journeys
    (panel.spec.js, fault_console.spec.js), but the pure-logic modules (url-state
    parse/serialize, viewport math, stage6-registry wiring, fs-editor edits, rail
    drawer) are e2e-only.
  impact: >
    Real logic with no pure contract pin. A regression in URL state parsing or fs-editor
    writes would surface only as an e2e failure with no unit-level failure pointing at
    the cause. For teaching-critical modules (fault-console is the user's B-6 surface;
    fs-editor is the editable filesystem surface) this is the highest-risk gap.
  recommendation: >
    Prioritize unit files for fault-console.js, fs-editor.js, url-state.js, and
    stage6-registry.js — these have the purest logic and the highest teaching surface.
    DOM-only modules (viewport, panel, rail) can remain e2e-only with a DOCUMENTS note.
  deep_dive: yes

- id: 6-08
  title: Sim core modules trace.js/trace-stage6.js/trace-helpers.js/engine-faults.js/engine-pool.js/engine-stage6.js/cdn-chain.js have no direct unit file
  severity: Medium
  category: architecture
  files:
    - js/sim/trace.js
    - js/sim/trace-stage6.js
    - js/sim/trace-helpers.js
    - js/sim/engine-faults.js
    - js/sim/engine-pool.js
    - js/sim/engine-stage6.js
    - js/sim/cdn-chain.js
    - js/sim/rng.js
    - js/sim/browser.js
    - js/sim/browser-seat.js
  evidence: >
    rng.js is only tested via engine.test.js's `createRng` describe (1 test, 14 lines).
    browser.js/browser-seat.js ride network.test.js + webserver-fault.test.js. The
    trace/* and engine-* modules are exercised only through engine.test.js and the 6
    fault suites.
  impact: >
    Coverage exists transitively — every frame assertion in engine.test.js rides the
    trace machine — but a trace-machine regression that keeps the output frames green
    while breaking an internal invariant (e.g. hop counting, frame minting order) has
    no unit-level pin. For the CDN edge pull (cdn-chain.js) and the stage-6 engine
    bootstrap (engine-stage6.js), the surface is small and the engine-level pins are
    tight, so the regression risk is lower.
  recommendation: >
    Acceptable as-is given the engine-level coverage density. If trace.js grows beyond
    its current 294 lines, split a dedicated trace.test.js. For cdn-chain.js and
    engine-stage6.js, the current engine.test.js coverage is enough.
  deep_dive: no

- id: 6-09
  title: Six B-6 fault suites' flag-validate + fail-loud + replay pattern is real and internally consistent
  severity: Praise
  category: test-contract
  files:
    - test/sim/cache-bypass.test.js:14-28, 67-73, 183-199
    - test/sim/loadbalancer-failover.test.js:167-184
    - test/sim/webserver-fault.test.js:22-33, 126-130, 179-199
    - test/sim/primary-down.test.js:13-27, 93-99, 272-291
    - test/sim/worker-crash.test.js:25-39, 180-186, 319-333
    - test/sim/dns-ledger-drop.test.js:25-40, 171-177, 316-330
  evidence: >
    Every fault suite pins three things: (a) the setter validates its input type and
    rejects with the flag's own error message (regex-matched), (b) the engine-level
    accessor is fail-loud below the stage that owns the component
    (`/stage N has no <Component>/`), and (c) a same-seed replay asserts byte-identical
    tick sequences. The pattern is mechanical enough that a future B-7 fault can lift
    it whole.
  impact: >
    The teaching contract's fail-loud guarantee is pinned at the unit layer. A learner
    who trips a fault outside its teaching stage gets a clear error, not a silent no-op.
  recommendation: Document the pattern in docs/plans/brief-template.md (or FACTORY.md) so
    future briefs reference it instead of re-inventing.
  deep_dive: no

- id: 6-10
  title: Panel suites bootstrap hand-built snapshot literals — contract-derived from the engine snapshot shape, not copy-pasted
  severity: Praise
  category: test-contract
  files:
    - test/panel/model-stage6.test.js:8-54
    - test/panel/model.test.js
    - test/panel/missions.test.js:8-11
  evidence: >
    model-stage6.test.js:8-54 builds a `baseSnapshot` that mirrors the engine's real
    snapshot shape (dns/router/workerQueue/trace objects with their real field names and
    mini-IP addresses). The hop-label tests read live off this literal via a
    `describeSnapshot({ ...baseSnapshot, trace: { ...baseSnapshot.trace, hop, ...over } })`
    helper. model.test.js similarly constructs snapshots by hand, with field names and
    mini-IP addresses matching real engine output.
  impact: >
    The panel unit surface is contract-coupled to the engine surface: a rename of a
    snapshot field on the engine side breaks the panel unit tests, which is the right
    failure mode. The literals are hand-shaped to the engine's real wire vocabulary, not
    recorded snapshots that would greenwash a regression.
  recommendation: Keep. Worth a one-line DESIGN.md note calling this out as the pattern.
  deep_dive: no

- id: 6-11
  title: Test titles carry the contract markers (CHECKS / PINS / DL-3) that storymap.yaml refs ride on
  severity: Praise
  category: process
  files: [test/]
  evidence: >
    Titles like "DL-3 counter-example — the bypassed story stays a full sourced 200; the
    non-GET frame keeps its own BYPASS token" (cache-bypass.test.js:153), "PINS: the
    stage-6 trace machine" (engine.test.js:59), "CHECKS: B-6c core contract"
    (cache-bypass.test.js:30) appear throughout. The brief notes these are manifest refs
    — "Titles are manifest refs (SIM slice tests) — do not reword" — and the suites
    carry this as a header comment (primary-down.test.js:4-10, worker-crash.test.js:4-8).
  impact: >
    A storymap.yaml ref to a title like "DL-3 counter-example — ..." is stable across
    refactors because the title itself IS the contract. Renaming the title would break
    the manifest ref, which is the right failure mode.
  recommendation: Keep the "do not reword" discipline; consider a guard that checks
    storymap.yaml refs still resolve to live test titles.
  deep_dive: no

- id: 6-12
  title: writeSink stub in worker-crash.test.js is the only sink-stub in the entire corpus — disciplined
  severity: Praise
  category: code-quality
  files: [test/sim/worker-crash.test.js:14-22]
  evidence: >
    `const writeSink = () => { const calls = []; return { calls, write(path, payload, atTick) { calls.push(...) } }; };`
    This is the only mock-shaped construct anywhere in test/. The brief confirms: "the
    only sink-stub found." Every other suite uses real component factories
    (`createDns({})`, `createDatabase({ replicationLagTicks: 3 })`, `createWebServer`,
    etc.) and real engine instances.
  impact: >
    The test corpus is almost entirely integration-level over real components, which is
    what makes the byte-identical replay pins meaningful. The single writeSink is
    justified — the queue's commit target is the database, and the stub records commits
    for the "exactly once" pin at worker-crash.test.js:160.
  recommendation: Keep. Worth a one-line AGENTS.md note pinning "no vi.* / no mock
  framework / sink-stubs only where the sink is outside the sim graph."
  deep_dive: no

- id: 6-13
  title: Missions suite pins registry shape AND both named counter-examples (404 vs 405, origin-HIT vs edge-HIT)
  severity: Praise
  category: test-contract
  files: [test/panel/missions.test.js:56-87]
  evidence: >
    missions.test.js:56-87 pins the stage-1 404 mission: positive case (real 404 from
    the unknown-path branch), named counter-example (405 does NOT complete the 404
    mission), and a further "plain 200 is not a missing-path answer" pin.
    missions.test.js:94-... pins the stage-2 failover two-leg mission: "either leg alone
    stays pending" — skip-only and serve-only both leave the chip pending.
  impact: >
    The teaching contract's mission detectors are pinned against both the positive case
    and the nearest wrong-case. A regression that over-eagerly completes a mission on a
    405 or on skip-only fails here.
  recommendation: Keep.
  deep_dive: no

- id: 6-14
  title: compare suite pins byte-verbatim pass-through, em-dash padding, and the tick-shaped rejection
  severity: Praise
  category: test-contract
  files: [test/panel/model-compare.test.js:20-70]
  evidence: >
    model-compare.test.js:20-40 pins unequal runs (9 vs 6) align to 9 rows with the
    exhausted side padded with em-dashes. Lines 42-53 pin equal runs hop-for-hop.
    Lines 55-70 pin byte-verbatim pass-through via `structuredClone` equality before/
    after (no mutation).
  impact: >
    The compare tray's rendering contract is pinned at the pure-model layer. A regression
    that mutates entries or drops em-dashes fails here.
  recommendation: Keep.
  deep_dive: no

- id: 6-15
  title: File-size discipline is excellent — all suites under 450, largest is 421
  severity: Praise
  category: process
  files: [test/]
  evidence: >
    Brief-confirmed: missions.test.js 421, camera.test.js 406, worker-crash 334,
    engine 353, dns-ledger-drop 331, model-stage6 316, model 296, primary-down 292. All
    under the 450-line gate. model-stage6.test.js:4-6 explicitly credits the
    guard-file-size for the extraction: "Stage-boundary extraction from model.test.js
    (guard-file-size) … so model.test.js stays inside the 450-line test cap."
  impact: >
    The size gate is biting, and the team is splitting by responsibility (model-stage6
    off of model) rather than gaming it. This is the guard working as designed.
  recommendation: Keep the gate; no action needed.
  deep_dive: no
```

---

## Deep-dive requests (orchestrator dispatch)

**6-07 (High, panel unit-coverage gaps):** Escalate to `opencode-go/gemini-4-argon`.

Targeted prompt for the deep-dive agent:

> Review the 17 untested panel modules (`fault-console.js`, `fs-editor.js`, `viewport.js`, `url-state.js`, `stage6-registry.js`, `inspector-source.js`, `inspector-source-stage6.js`, `journey-log.js`, `missions-view.js`, `model-dbop.js`, `orrery-svg.js`, `panel.js`, `rail.js`, `render-stage.js`, `teaching-drawer.js`, `layout-geo.js`, `hop-targets.js`) and the e2e coverage in `e2e/panel.spec.js` + `e2e/fault_console.spec.js`.
>
> For each untested module, classify: (a) pure logic with no DOM dependency (high unit-test ROI — should get a unit file), (b) DOM-only (e2e is the right layer), (c) mixed (could split pure core out).
>
> Pay particular attention to `fault-console.js` (the user's B-6 teaching surface), `fs-editor.js` (editable filesystem surface), and `url-state.js` (parse/serialize round-trip) — these have the highest teaching risk per untested line.
>
> Output a prioritized list of which 3-5 modules most deserve unit files, with the contract surface each should pin. Stay under 150 lines.

---

## Brief-vs-code verification

All spot-checked claims in the researcher's brief held up:

- **Confirmed:** 16 sim + 10 panel suites.
- **Confirmed:** no `it.skip`/`describe.skip`/`todo`/`TODO` (ripgrep: 0).
- **Confirmed:** no `Math.random`/`Date.now`/`vi.*`/fake timers anywhere in `test/`.
- **Confirmed:** `render.test.js` does NOT import `render.js` — imports `model.js` at line 2.
- **Confirmed:** `camera.test.js` is 406 lines with 5 `it()` blocks.
- **Confirmed:** all 6 B-6 fault suites pin fail-loud, fault branch, restore, and same-seed replay.
- **Confirmed:** `DL-3 counter-example` appears verbatim in titles in 5 sim suites.
- **Confirmed:** whole-frame `toEqual([...])` is the dominant assertion style.
- **Confirmed:** 17 panel modules have no unit file.
- **Minor gap found (6-02):** loadbalancer-failover's same-seed test omits the toggle-no-residue check that the other 5 fault suites carry. Brief did not name this asymmetry, but the brief did not claim it either — it listed facts only.

No brief-vs-code mismatches.

### Deep-dive 6-07 adjudication (dispatched by orchestrator, `opencode-go/gemini-4-argon`)

**17-module classification** (class = unit-test ROI: (a) pure / (b) DOM-only / (c) mixed):

| Module                     | Class                          | DOM boundary evidence                                                                 |
| -------------------------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| hop-targets.js             | (a) pure, zero DOM             | none — `hop-targets.js:1-197`, 0 DOM/window refs; pure `snapshot -> {cardId, laneId}` |
| model-dbop.js              | (a) pure, zero DOM             | none — `model-dbop.js:8-24`                                                           |
| layout-geo.js              | (a) pure, transitively covered | none — re-exported via `layout.js`, exercised in `camera.test.js:19,121,157`          |
| inspector-source.js        | (a) pure data table            | none — static `COMPONENT_SOURCE` map (`:11-270`)                                      |
| inspector-source-stage6.js | (a) pure data table            | none — static `STAGE6_SOURCE` map (`:5-122`)                                          |
| fault-console.js           | (c) mixed                      | pure readers/writers `:25-167`; DOM from `:170`                                       |
| journey-log.js             | (c) mixed                      | pure store/relabel/copy `:14-62`; DOM sink `:43`                                      |
| url-state.js               | (c) mixed                      | pure clamp/parse `:13-18`; `window.location`/`history` at `:12,25,28`                 |
| panel.js                   | (c) mixed                      | pure `traceFinalHop` `:36-55`; DOM controller from `:23,60`                           |
| fs-editor.js               | (c) mixed                      | pure `routeIdFor` `:30`; DOM from `:42`                                               |
| viewport.js                | (b) DOM-only                   | pure math lives in `camera.js`/`layout.js`; DOM from `:82,88,103`                     |
| missions-view.js           | (b) DOM-only                   | pure rules in `missions.js`; DOM from `:20,38`                                        |
| teaching-drawer.js         | (b) DOM-only                   | pure copy in `teaching.js`; DOM from `:19,27`                                         |
| rail.js                    | (b) DOM-only                   | tab/host DOM state throughout (`:31,44,70`)                                           |
| render-stage.js            | (b) DOM-only                   | hop lookup already split to `hop-targets.js`                                          |
| stage6-registry.js         | (b) DOM-only injector          | DOM from `:19,47,63`                                                                  |
| orrery-svg.js              | (b) DOM-only SVG writer        | thin `createElementNS` loop (`:9,41`)                                                 |

**Top 5 priority unit-file targets** (each with contract surface to pin):

1. **hop-targets.js → `test/panel/hop-targets.test.js`** — 197 lines of pure multi-stage branching, zero unit imports; the false-pin header (`:5-6`) is 4-01, and `e2e/panel.spec.js` never asserts `.active-hop`/`.lane-active` classes either, so nothing anywhere pins the mapping. Pin: stage 1–4 chains incl. `node-webserver` vs `-2` on `targetServer === '10.12'` and `packet-req-db` vs `packet-res-db` on `dbOp === 'WRITE'`; stage-5 `asyncJob` counter-example (hop 4 queue vs db; hop 8 `packet-res-db` vs `packet-res-worker`); stage-6 host-less/`hop - 2` DNS prelude and CDN HIT 6-hop vs MISS/PASS 9-hop.
2. **fault-console.js pure core → `test/panel/fault-console.test.js`** — pin `FAULTS` registry per stage (exact ids/chips), `warnKind` bypass/dropped vs down/primary/worker semantics, `faultStateIn` reading live component state from real `createEngine({stage})` snapshots for all 5 fault kinds, and `flipFault` dispatch round-tripping the engine's fail-loud setters.
3. **journey-log.js (+ `panel.js traceFinalHop`) → `test/panel/journey-log.test.js`** — pin consecutive-frame dedupe + 20-entry cap, run-denominator relabeling (`hop 1/9 → 1/2` on stage-6 NX; `1/6` CDN HIT; `1/8` host-less; crowd ticks untouched), and `getRunEntries` defensive copying so compare-tray captures are not mutated by later trims.
4. **model-dbop.js** — pure module whose B-6d `WRITE_DOWN` branch has zero unit assertions; pin all 4 `dbOpSentence` branches plus stage-4/5 `describeSnapshot` integration surfacing the refusal sentence on `WRITE_DOWN`.
5. **inspector-source.js + -stage6.js** — pin structural invariants: `Object.keys(COMPONENT_SOURCE)` matches the 10 selectable components supported by `formatComponentState`/`componentTitle`, and every entry carries a valid `js/sim/<name>.js` path + non-empty factory snippet. (This is the same drift risk chunk 5 filed as 5-01 — see feedback cross-ref in the aggregated assessment.)
