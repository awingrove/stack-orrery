# Chunk 3 — Panel state — Review Report

- **Reviewer:** Qwen3.7 Plus
- **Date:** 2026-10-31
- **Scope:** `js/panel/model.js`, `model-stage5-chain.js`, `model-stage6.js`,
  `model-dbop.js`, `stage6-registry.js`, `url-state.js`, `inspector-state.js`
  (817 LOC total, all within the 300-line gate).
- **Sources consulted:** brief `briefs/chunk-3-panel-state.md`, `AGENTS.md`,
  `map.md`, the seven files above, sim-side counterparts
  (`js/sim/cache.js`, `dns.js`, `database.js`, `queue.js`, `webserver.js`,
  `cdn.js`, `engine.js`, `network.js`, `trace.js`, `trace-helpers.js`), and
  `test/panel/model*.test.js` + `render.test.js`.

Brief-vs-code verification: the brief's LOC counts, line citations, default
values, mini-IP literal count, and import graph all match the code on
inspection. One brief claim required refinement — the naming drift between
sim `serviceRate` and panel `serviceRatePerTick` is real but the brief framed
it only as a duplicated default rather than also a naming inconsistency. I
elevated that to its own finding (3-03).

---

## Findings

```yaml
- id: 3-01
  title: network.interfaces is a hand-rebuilt per-stage literal, not derived from the sim
  severity: Medium
  category: architecture
  files:
    - js/panel/inspector-state.js:79-141
    - js/sim/network.js:19-51
  evidence: |
    inspector-state.js:78-141 is a 5-deep nested ternary keyed on snapshot.stage,
    each branch an object literal of mini-IP → role strings:
      interfaces:
        snapshot.stage === 6
          ? { 10.1: 'LoadBalancer', 10.11: 'WebServer-1', ..., Crowd: ... }
          : snapshot.stage === 5
            ? { 10.1: 'LoadBalancer', ..., '10.40': 'WorkerQueue', 10.41: 'Worker', Crowd: ... }
            : snapshot.stage === 4
              ? { ... '10.30': 'Database (Primary)', '10.31': 'Database (Replica)', ... }
              : ...
    The sim's network holds the actual registry in a private Map
    (js/sim/network.js:20 `const servers = new Map();`) populated via
    `registerServer(address, server)` (line 48), but it exposes no read-side.
    The panel therefore re-authors the role strings and mini-IPs per stage.
  impact: |
    Each new stage or component requires a new branch in the ternary AND
    parallel entries in any test that asserts the network state. The comment
    at inspector-state.js:76-77 ("mini-IP keys are quoted strings — a bare
    `10.20:` literal collapses to the number 10.2") shows the author is
    already navigating JS footguns unique to this table. A new component
    landing in the sim has no forcing function to add a row here — drift is
    the default.
  recommendation: |
    Either (a) expose a read-side on the sim network (e.g. `registry()`
    returning `{ address, role }[]` populated at register time with a role
    tag supplied by each component), and let inspector-state consume it; or
    (b) centralise the per-stage table in one data-first constant in the
    panel (array of `{ stage, address, role }`) and reduce `interfaces` to
    `Object.fromEntries(table.filter(r => r.stage <= stage).map(...))`.
    Option (a) is the stronger move because it closes the sim→panel drift
    window the brief flags.
  deep_dive: no

- id: 3-02
  title: Sim defaults (TTL 10/300, lag 3, jobDuration 2, serviceRate 4) duplicated across 3+ panel files
  severity: Medium
  category: DRY
  files:
    - js/panel/model.js:64,203,205,222,231
    - js/panel/model-stage5-chain.js:56
    - js/panel/inspector-state.js:156,176,187,199,209,228
    - js/panel/stage6-registry.js:34,42,105-107
    - js/sim/cache.js:18
    - js/sim/dns.js:29
    - js/sim/database.js:27
    - js/sim/queue.js:20
    - js/sim/webserver.js:35
    - js/sim/engine.js:35-47
  evidence: |
    Five constants are re-stated as panel-side `??` fallbacks:
      ttlTicks 10          → cache.js:18 ; model.js:203 ; inspector-state.js:176 ; stage6-registry:42,107
      ttlTicks 300         → dns.js:29   ; model.js:222 ; inspector-state.js:209 ; stage6-registry:34,105
      replicationLagTicks 3 → database.js:27; model.js:64,205; model-stage5-chain.js:56; inspector-state.js:187
      jobDurationTicks 2   → queue.js:20 ; inspector-state.js:199
      serviceRate 4        → webserver.js:35 ; engine.js:35 ; inspector-state.js:156
    The snapshot normally carries the live value, so the `??` paths fire only
    for the zero-state/missing-component case — but they fire as the user's
    visible headline (cacheStatsLabel, FIRST_TEXT in stage6-registry, the
    inspector's rendered JSON). If a future stage rebalances, say, the DNS
    TTL to 600, the panel's `?? 300` fallback silently lies for any snapshot
    that arrives without `dns.ttlTicks` set.
  impact: |
    Drift is invisible because the `??` only engages when the sim does not
    supply a value — exactly the case where a rebalance is most likely to
    surface (a new component, a disabled component, a stub snapshot in a
    test). The teaching contract says the panel mirrors the sim; silent
    numeric drift undermines that mirror without tripping any test.
  recommendation: |
    Mint one `js/panel/sim-defaults.js` that re-exports the canonical values
    (or import them from the sim factories, which are pure and have no DOM
    dependency), and have model.js / inspector-state.js / stage6-registry.js
    reference the shared constants. Alternatively, have the sim's snapshot()
    always populate these fields (even for disabled components) so the panel
    never needs a fallback — the stronger option, because it removes the
    fallback path entirely.
  deep_dive: no

- id: 3-03
  title: Naming drift — sim's serviceRate is panel's serviceRatePerTick
  severity: Low
  category: code-quality
  files:
    - js/sim/webserver.js:35
    - js/sim/engine.js:35
    - js/panel/inspector-state.js:156
  evidence: |
    The sim's webserver and engine both name the parameter `serviceRate`:
      webserver.js:35 `serviceRate = 4,`
      engine.js:35    `serviceRate = 4,`
    The panel's webserver builder emits a different name:
      inspector-state.js:156 `serviceRatePerTick: 4,`
    The concept is identical — "requests served per tick" — but a reader
    jumping between the inspector JSON and the sim source has to mentally
    reconcile two names.
  impact: |
    Maintenance friction and a small but real teachability leak: the
    inspector is a teaching surface, and the naming mismatch means the
    inspector's JSON does not match the source the student is reading.
  recommendation: |
    Rename inspector-state.js:156's key to `serviceRate` to match the sim,
    OR add a one-line comment tying the two names. The rename is the cleaner
    fix; update test/panel/model.test.js:242's expectation to match.
  deep_dive: no

- id: 3-04
  title: Circular module edge between model.js and model-stage6.js
  severity: Medium
  category: architecture
  files:
    - js/panel/model.js:6,23
    - js/panel/model-stage6.js:9
  evidence: |
    model.js:6 `import { stage6Sentences } from './model-stage6.js';`
    model.js:23 exports `withHopPrefix`.
    model-stage6.js:9 `import { withHopPrefix } from './model.js';`
    The edge is `model.js → model-stage6.js → model.js`. ES module hoisting
    makes this work at runtime because `withHopPrefix` is a function
    declaration-style const and is not used during module evaluation, but the
    cycle is real and visible to any tool that walks the graph, and it
    violates the otherwise clean hub-and-spoke shape (model.js is the hub;
    stage addenda are spokes).
  impact: |
    Today the cycle is harmless. When a fourth stage-addendum module lands
    (stage 7, say) and wants the same `withHopPrefix`, the author will have
    to either import from the hub (extending the cycle) or duplicate the
    helper. The cycle also complicates any future tree-shaking or
    code-splitting experiment.
  recommendation: |
    Lift `withHopPrefix` (5 tokens of logic: `parts.map((p, i) => \`Hop
    \${i + 1}/\${total}: \${p}\`)`) into a tiny leaf module — or inline it
    into model-stage6.js and model-stage5-chain.js as a local helper. The
    hub loses one export and the graph becomes acyclic. model-dbop.js is
    already the model for this extraction.
  deep_dive: no

- id: 3-05
  title: TOTAL_HOPS table agrees with sim trace machines by comment, not derivation
  severity: Medium
  category: architecture
  files:
    - js/panel/model.js:11-15
    - js/sim/trace.js:4-10
    - js/sim/trace-stage6.js:13-26
    - js/sim/trace-helpers.js
  evidence: |
    model.js:15 `const TOTAL_HOPS = { 1: 4, 2: 5, 3: 6, 4: 7, 5: 8, 6: 9 };`
    trace.js:4-10 is a comment block that narrates the same numbers
    ("4 hops in Stage 1 ... 5 in Stage 2 ... 6 in Stage 3 ... 7 in Stage
    4"); trace-stage6.js:13-26 counts the stage-6 shapes (9 for hosted,
    6 for CDN HIT, 2 for NX). The two sides never share a constant — they
    are reconciled only by the author's careful reading of both files.
    model-stage6.js:71 even hard-codes `t.edgeStatus === 'HIT' ? 6 : 9`
    inline, with the matching logic living only in the trace machine.
  impact: |
    A stage added tomorrow with 10 hops, or a rebalanced stage-6 shape,
    would require coordinated edits in sim and panel. No test pins the
    sim's final-hop number against the panel's TOTAL_HOPS entry, so the
    CI gate would not catch a drift.
  recommendation: |
    Either (a) expose a `finalHop(stage, shape)` on the trace machines and
    import it into model.js, or (b) at minimum pin each TOTAL_HOPS entry
    in a test that also imports the corresponding trace machine's shape
    constant. The brief's "hop-count knowledge lives only in comments"
    framing is correct; the fix is to make the knowledge executable.
  deep_dive:
    yes
    # Escalation target: opencode-go/gemini-4-argon. Question: given that
    # the sim's trace machines are stage-specific (trace.js vs
    # trace-stage6.js) and already branch on shape (hosted vs CDN vs NX),
    # is there a low-cost way to expose a shared `finalHop` surface that
    # model.js can import without entangling the sim in panel concerns?
    # Judge only: feasibility and the shape of the extraction. Do not
    # propose code; return a one-paragraph verdict.

- id: 3-06
  title: stage6-registry.js is a one-shot DOM injector with only DOM-id coupling to consumers
  severity: Low
  category: architecture
  files:
    - js/panel/stage6-registry.js:14-60
    - js/panel/panel.js:23
    - js/panel/render.js:105
    - js/panel/render-stage.js:12
  evidence: |
    stage6-registry.js:14-18 holds a module-scope `let injected = false;`
    guard; ensureStage6Dom() appends the DNS/Router/CDN cards, wire
    columns, and comp-tab buttons once at boot. render.js and render-stage.js
    find the injected nodes by id, with comments ("JS-injected by
    stage6-registry.js, so their lookups stay lazy") as the only contract.
    FIRST_TEXT (L104-108) duplicates the zero-state stat strings that
    model.js:203,220-222,229-231 rebuilds from the same default counters.
  impact: |
    The registry works, and the idempotency guard is correct. But the
    contract with consumers is by comment, not by code; the FIRST_TEXT /
    model.js stat-string duplication is a small instance of the same drift
    risk as 3-02. A new stage-6 sub-component (Bridge, say) would require
    parallel edits in stage6-registry, render, and model.
  recommendation: |
    Acceptable as-is for the current scope. If stage 7 lands with its own
    DOM injection, consolidate the pattern: a registry module that returns
    `{ id, component, firstText }` descriptors and a shared renderer, so
    the "inject once, look up by id" contract is encoded once.
  deep_dive: no

- id: 3-07
  title: Hub fan-out — model.js has 7 exports consumed by 6 different importers
  severity: Low
  category: architecture
  files:
    - js/panel/model.js
  evidence: |
    Exports: TICK_MS, withHopPrefix, journeyEntryIsBefore, orderJourneyEntries,
    alignCompareRows, nextCompareSlots, describeSnapshot. Consumers:
    panel.js (TICK_MS), render.js (describeSnapshot), compare.js
    (alignCompareRows, nextCompareSlots), journey-log.js
    (orderJourneyEntries), model-stage6.js (withHopPrefix), plus four test
    files. The module mixes four concerns: sim constants, journey ordering,
    compare alignment, and snapshot description.
  impact: |
    Each new concern added to model.js raises its import fan-out and makes
    the test surface noisier (model.test.js already pins five unrelated
    shapes). The stage-addendum extractions (model-stage5-chain, model-stage6,
    model-dbop) already demonstrate the extraction path; the hub itself has
    not been split with the same discipline.
  recommendation: |
    Not urgent at 250 LOC (under the gate). When the next stage addendum
    lands, use it as the trigger to split: a `model-journey.js` for the
    ordering pair and a `model-compare.js` for the compare pair would cut
    model.js to ~130 LOC and reduce its import fan-out to describeSnapshot
    + TICK_MS.
  deep_dive: no

- id: 3-08
  title: Small-file sprawl — model-dbop.js (24 LOC) and url-state.js (29 LOC)
  severity: Low
  category: YAGNI
  files:
    - js/panel/model-dbop.js
    - js/panel/url-state.js
  evidence: |
    model-dbop.js: 24 LOC, one exported function. url-state.js: 29 LOC, two
    small exported functions. Both carry precedent comments
    ("guard-file-size; the model-stage6.js precedent" at model-dbop.js:3;
    "split from panel.js by responsibility (guard-file-size)" at
    url-state.js:3). Both are genuine responsibility extractions, not
    premature factoring.
  impact: |
    Each file adds an import edge and a discoverability tax. At 24/29 LOC
    they are below the cost of navigating to them. Acceptable as precedents;
    not a template to repeat for similar-sized helpers without the same
    responsibility clarity.
  recommendation: |
    Leave as-is. The precedent comments are load-bearing — future
    extractions should carry the same note so the reviewer can judge whether
    the bar was met.
  deep_dive: no

- id: 3-09
  title: stage6-registry firstText and model.js default stat strings say the same thing twice
  severity: Low
  category: DRY
  files:
    - js/panel/stage6-registry.js:34,42,104-108
    - js/panel/model.js:203,220-222,229-231
  evidence: |
    stage6-registry.js:34 `'dns-stats', 'Lookups: 0 · Cached: 0 · Authoritative: 0 · TTL: 300t'`
    stage6-registry.js:105 same string in FIRST_TEXT.
    model.js:222 builds the same shape from `snapshot.dns` with `?? 300`
    fallbacks; model.js:203,231 likewise for cache (TTL 10t) and CDN
    (TTL 10t). The registry's initial text and the model's fallback text
    are generated from the same default numbers by two different pieces of
    code.
  impact: |
    A TTL rebalance would require editing both the registry's literal
    strings and the model.js fallback numbers. The two strings are byte-
    identical today, so a test could catch drift cheaply.
  recommendation: |
    Fold FIRST_TEXT into the same helper that builds the model.js stat
    labels, OR pin byte-equivalence in a test. The registry's strings are
    the zero-state case of the model's strings; the code should reflect
    that.
  deep_dive: no
```

## Praise

```yaml
- id: 3-10
  title: The sim mirror is genuinely derived where it matters
  severity: Praise
  category: code-quality
  files:
    - js/panel/inspector-state.js:59-234
    - js/panel/model.js:170-249
  evidence: |
    inspector-state.js's STATE_BUILDERS read real snapshot fields:
    `snapshot.cache?.entries ?? []` (L182), `snapshot.dns?.cache ?? []`
    (L214), `snapshot.cdn?.ledger ?? []` (L233), `snapshot.database?.rows`
    (L194), `snapshot.workerQueue?.pendingJobs ?? []` (L203). These are the
    same structures the sim's components produce (cache.js:119-125's
    entries Map, queue.js:160-161's pendingJobs copy, etc.). model.js's
    `describeSnapshot` reads `snapshot.served`, `snapshot.tick`,
    `snapshot.loadBalancer?.perBackend`, `snapshot.browserDisplay` — all
    sim-produced. No probability fakes, no hardcoded narratives. The brief's
    "the mirror is derived, not probabilistic" claim is confirmed line by
    line.
  impact: |
    This is the project's core teaching contract, and the panel side holds
    it. A cache HIT in the UI is the same Map lookup the sim just performed;
    a CDN ledger row on screen is the same row the edge just filled. The
    student sees the mechanism they are being taught.
  deep_dive: no

- id: 3-11
  title: Claim vocabulary (CHECKS/PINS/DOCUMENTS) used with discipline and named counter-examples
  severity: Praise
  category: process
  files:
    - js/panel/model.js:1,42-46,114-119,134-140,151-157,179-181
    - js/panel/model-stage5-chain.js:1,21-24
    - js/panel/model-stage6.js:1,13-15,50-52,68-70
    - js/panel/inspector-state.js:11-16,76-77,222-223
  evidence: |
    Every CHECKS/PINS block names a counter-example and pins it in a test:
      model.js:42-46 the 2-hop refusal shape (pinned in model-stage34.test.js)
      model.js:114-119 journey chronology (pinned in render.test.js)
      model.js:134-140 compare em-dash alignment (pinned in model-compare.test.js)
      model.js:151-157 trace-runs-only gate (pinned in model.test.js)
      model.js:179-181 0.00/t at tick 0 (pinned in model.test.js)
      model-stage5-chain.js:21-24 crashed-worker tail hop (model-stage5.test.js)
      model-stage6.js:13-15 CDN HIT-no-fill shape (model-stage6.test.js)
      model-stage6.js:68-70 CDN 6/9-hop count (model-stage6.test.js)
      inspector-state.js:11-16 derive-from-snapshot title rule (model.test.js)
    The claim vocabulary is never used as decoration — every instance binds
    to a real test.
  impact: |
    This is what makes the test suite legible as a contract rather than a
    checklist. A future author changing a sentence shape has a named test
    to update and a named counter-example not to break.
  deep_dive: no

- id: 3-12
  title: stage6-registry.js is clean, idempotent, and CSP-correct
  severity: Praise
  category: code-quality
  files:
    - js/panel/stage6-registry.js:16-60
  evidence: |
    ensureStage6Dom() uses only createElement / textContent / append /
    setAttribute — no innerHTML, no inline handlers, no inline styles. The
    idempotency guard (`let injected = false; if (injected) return;`) is
    module-scope and correct. The dataset.testid / dataset.component
    assignments (L65-66) give render.js a stable hook without leaking
    implementation details.
  impact: |
    The registry is a model for any future DOM injection (stage 7's Bridge
    card, say). The pattern is copy-pasteable without copying the mistakes.
  deep_dive: no

- id: 3-13
  title: url-state.js is tight, pure, and well-pinned with a named counter-example
  severity: Praise
  category: code-quality
  files:
    - js/panel/url-state.js
  evidence: |
    29 LOC, two functions, both pure over window.location. readDeepLink
    clamps stage 1-6 and users 1-50 with clean fallbacks (stage 1, users 5)
    and no console error on invalid input. syncUrlState uses
    history.replaceState and preserves existing params. The CHECKS block at
    L5-10 names the ?stage=9 counter-example and pins it in e2e/panel.spec.js.
  impact: |
    Deep-linking is a small feature done with the same discipline as the
    larger surfaces. The fallback-without-error contract is exactly what a
    shared URL needs.
  deep_dive: no

- id: 3-14
  title: Stage-addendum extraction pattern is well-executed
  severity: Praise
  category: code-quality
  files:
    - js/panel/model-stage5-chain.js
    - js/panel/model-stage6.js
    - js/panel/model-dbop.js
  evidence: |
    The three addendum modules each own one responsibility (stage-5 chain
    sentences, stage-6 sentences, db-op sentence); they are pure (no DOM,
    no sim imports); they are consumed by model.js's hopSentences switch
    without leaking stage knowledge back into the hub. model-dbop.js's
    default-arg signature (`{ stale = false, primary = '10.30', ... }`)
    makes it trivially testable. The byte-identical reuse of
    stage5ChainParts between the plain stage-5 shape and the stage-6
    host-less shape (model-stage6.js:65) is exactly the kind of sharing the
    pattern is meant to enable.
  impact: |
    When stage 7 lands, the same pattern scales: a model-stage7.js
    consuming stage5/6 parts as needed, a new case in model.js's
    hopSentences, no hub bloat.
  deep_dive: no
```

## Deep-dive requests (orchestrator dispatch)

**Item 1 (from finding 3-05) — target model `opencode-go/gemini-4-argon`:**

> The sim has two trace machines (`js/sim/trace.js` for stages 1–5 and
> `js/sim/trace-stage6.js` for stage 6's three shapes: hosted 9-hop,
> CDN 6/9-hop, NX 2-hop). The panel has `TOTAL_HOPS = { 1: 4, 2: 5, 3: 6,
4: 7, 5: 8, 6: 9 }` at `js/panel/model.js:15`, plus inline shape counts
> (`t.edgeStatus === 'HIT' ? 6 : 9` in model-stage6.js:71). These numbers
> agree with the sim only by comment and the author's careful reading.
>
> Question for judgment only: is there a low-cost way to expose a shared
> `finalHop(stage, shape)` surface from the sim trace machines that
> model.js could import, without entangling the sim in panel concerns or
> disturbing the stage-specific split between trace.js and
> trace-stage6.js? Consider whether the sim's hop semantics (one hop per
> call, stage-dependent final hop, shape-dependent in stage 6) admit a
> small read-only surface that stays inside the sim's own contract.
>
> Do not propose code. Return a one-paragraph verdict: feasible / not
> feasible / feasible-with-caveats, and the shape of the extraction if
> feasible.

---

## Summary counts

| Severity | Count                            |
| -------- | -------------------------------- |
| Critical | 0                                |
| High     | 0                                |
| Medium   | 4 (3-01, 3-02, 3-04, 3-05)       |
| Low      | 5 (3-03, 3-06, 3-07, 3-08, 3-09) |
| Praise   | 5 (3-10, 3-11, 3-12, 3-13, 3-14) |

No critical or high findings: the panel-side mirror genuinely reads the
sim's snapshot where it matters (3-10), the claim vocabulary is disciplined
(3-11), and the stage-addendum extraction pattern scales cleanly (3-14).
The load-bearing debt is architectural: the `network.interfaces` table
(3-01), the scattered default-value fallbacks (3-02), the hub↔spoke cycle
(3-04), and the comment-only reconciliation of hop counts between sim and
panel (3-05). None of these break today; each raises the cost of the next
stage landing.

### Deep-dive 3-05 verdict (dispatched by orchestrator, `opencode-go/gemini-4-argon`)

**Verdict: feasible-with-caveats.** A pure, read-only
`finalHop(stage, trace = {})` helper in `js/sim/trace-helpers.js` (already
imported by both trace machines) can be the single source of truth for
sim step termination and panel denominators without entangling the sim in
panel concerns or disturbing the trace.js / trace-stage6.js split. The sim
already computes finalHop solely from `stage` + live trace flags
(`trace.js:96-98`, `trace-stage6.js:183-191`).

- `finalHop(stage)` with no second argument returns the nominal totals
  (matching TOTAL_HOPS) and replaces `model.js:15`.
- `finalHop(stage, snapshot.trace)` yields the shape-specific count for
  `withHopPrefix` in model.js and model-stage6.js, eliminating the
  hardcoded `/4`–`/7` denominators in stages 1–4.

**Caveats:** (1) shape flags (`nx`, `cdn`, `refused`, `edgeStatus`) are
discovered dynamically at hop 2-3 — at hop 1 a hosted stage-6 trace finalizes
9 before `nx` or `cdn`/HIT is known, matching current per-snapshot re-evaluation;
(2) in stages 2-5, `trace.js:98` sets `finalHop = 3` on LB all-down refusal,
whereas `model.js:41` only shortens sentences on `stage === 1 && t.refused` —
model.js must either pass `t` only in stages 1/5/6 or align stage 2-5
refusal sentence arrays with the 3-hop abort.
