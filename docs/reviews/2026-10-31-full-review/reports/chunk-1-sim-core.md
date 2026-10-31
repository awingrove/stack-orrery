# Chunk 1 — Sim core — Review Report

- **Reviewer:** Qwen3.7 Plus (chunk-1 reviewer)
- **Date:** 2026-10-31
- **Sources read:** `AGENTS.md`, `docs/reviews/2026-10-31-full-review/map.md`,
  `docs/reviews/2026-10-31-full-review/briefs/chunk-1-sim-core.md`, every file
  in `js/sim/` the charter names, plus `js/sim/engine-stage6.js`,
  `js/sim/engine-pool.js`, `js/sim/cdn-chain.js`, `js/sim/loadbalancer.js`
  (for boundary verification), and `test/sim/engine.test.js`,
  `test/sim/network.test.js`, `test/sim/router.test.js` (pin-strength skim).
- **Method:** brief-vs-code verification first, then the charter's judgement
  questions (tick-loop, snapshot/trace audit chain, chainStep duplication,
  engine-vs-engine-stage6 pattern, rng hygiene, misc duplication, future-stage
  fitness).

## Brief-vs-code mismatches spotted while verifying

The charter says a brief-vs-code mismatch is itself a finding. Three surfaced
before any judgement work:

- **MINI_IP count understated.** Brief §Risk hotspots says _"MINI_IP regex in
  4 files (`network.js:17`, `router.js:15`, `browser.js:9` inline
  `/^\d+\.\d+$/`, `browser-seat.js:10`)"_. A fresh grep finds the named
  `MINI_IP` constant in **six** files
  (`network.js:17`, `router.js:15`, `browser-seat.js:10`, `cdn.js:22`,
  `loadbalancer.js:25`, `dns.js:27`) plus `browser.js:9` as an inline
  literal — seven surfaces, not four. Finding 1-03 inherits the corrected
  count.
- **`users.js` receiveResponse direction.** Brief §Risk hotspots claims
  _"users.js receiveResponse only routes responses whose from IP host number
  ≥ 3 (10.3+; `i >= 0` check excludes the learner's 10.2 browser)"_. The
  code is `const i = Number(String(exchange.from).split('.')[1]) - 2; if
(i >= 0) browserFor(i).receiveResponse(exchange);` — a `from` of `10.2`
  gives `i === 0`, and `i >= 0` is true, so the learner's 10.2 crowd browser
  **is** included (then the engine's `step()` / `traceMachine.onFinish`
  routes the same record into the separate `clientBrowser` a second time).
  The brief misread its own code; not a code defect, but a brief defect
  because it is offered to reviewers as load-bearing context.
- **`chainStep` "byte-identical stage-5 replay" overstated.** Brief §Risk
  hotspots correctly flags the missing refusal branch in `trace-stage6.js`
  `chainStep` s5===2, but the narrative still calls the stage-5 chain
  _"byte-identical"_. The LB-hop frame is not byte-identical — it also drops
  the skip narration (`trace.js:171` uses `lbEnqueuedFrame` with
  `skippedAt`; `trace-stage6.js:135` inlines only the happy-path literal).
  This is the heart of finding 1-01.

## Findings

```yaml
- id: 1-01
  title: Stage-6 chainStep re-implements the LB hop and drops both the B-6b refusal branch and the skip narration
  severity: High
  category: DRY
  files:
    - js/sim/trace.js:147-172
    - js/sim/trace-stage6.js:119-136
    - js/sim/trace-helpers.js:55-63
  evidence: |
    trace.js:152-172 (stage ≥ 2 hop 2):
      const atTick = bumpTick();
      const target = lb.enqueue({ id: `you:${atTick}`, ..., isYou: true });
      if (target?.refused === true) {
        trace.refused = true;
        onRefusal?.(target);
        frame = hops.lbRefusedFrame(serverAddress, target, trace.request);
      } else {
        const skippedAt = lb.lastSkip?.();
        trace.targetServer = target;
        frame = hops.lbEnqueuedFrame(serverAddress, target, trace.request, skippedAt);
      }

    trace-stage6.js:124-135 (chainStep s5 === 2):
      const atTick = bumpTick();
      const target = lb.enqueue({ id: `you:${atTick}`, ..., isYou: true });
      trace.targetServer = target;
      return `LB ${serverAddress} -> ${target} (${trace.request}) queued`;

    loadbalancer.js:120-133 — enqueue returns a refusal record
    `{ refused: true, response: null }` on the all-down fail-out, not a
    string address.
  impact: |
    Two concrete teaching-contract breaks in stage 6:

    1. All-down B-6b: `lb.enqueue` returns the refusal record; `trace.targetServer`
       is assigned a plain object, so the frame renders as
       `LB 10.1 -> [object Object] (GET /about) queued`, `backendFor(servers,
       trace.targetServer)` in s5 === 3 falls through to `servers[0]`, and the
       trace walks on with a phantom served record instead of aborting with the
       refusal card the stage-2..5 machine would have shown. The DL-3 negative
       case the brief pins in trace.js:164-172 simply does not exist on the
       stage-6 path.
    2. Healthy pool with one down backend: trace.js narrates
       `LB 10.1 -> 10.12 (GET /) queued — 10.11 is down — skipped`; chainStep
       narrates `LB 10.1 -> 10.12 (GET /) queued`. The skip — the whole
       point of the LB's health-aware cursor — is invisible in stage 6.

    The stage-6 machine is sold to the learner as the stage-5 chain shifted
    +2; it is not, on this hop. The divergence is exactly the DL-3 class
    "two machines, two stories" defect the modeling contract warns about.
  recommendation: |
    Move the LB hop into `trace-helpers.js` as a shared `lbEnqueueHop(trace,
    { serverAddress, lb, bumpTick, onRefusal })` that returns `{ frame,
    refused }`. Both `trace.js` and `trace-stage6.js`'s `chainStep` call it
    and branch on `refused` identically. Add a `engine.test.js` case that
    runs the stage-6 trace with both backends down and pins the same refusal
    frame the stage-2..5 machine produces.
  deep_dive: no

- id: 1-02
  title: Two `freshTrace()` shapes, one with `refused` and one without, silently encode different state vocabularies
  severity: Medium
  category: DRY
  files:
    - js/sim/trace.js:64-88
    - js/sim/trace-stage6.js:92-113
  evidence: |
    trace.js RESET_FIELDS:
      const RESET_FIELDS = {
        cacheStatus: null, dbOp: null, dbStale: false,
        response: null, status: null, body: null,
        routeId: null, refused: false,
      };

    trace-stage6.js freshTrace adds host/dnsTarget/cdn/edgeStatus/nx/asyncJob
    but has no `refused` field at all.
  impact: |
    `refused` is the stage-1/2 abort signal; absent from the stage-6 record,
    the snapshot's trace shape depends on which machine last ran. Any future
    consumer that switches on `trace.refused` (the stage-6 equivalent of the
    B-6b abort would want one) has to branch on which machine it is talking
    to. The two shapes also make it harder to diff trace records across
    stages in tests and in the panel's inspector state.
  recommendation: |
    Unify on one `freshTraceForStage(stage)` factory in `trace-helpers.js`
    that returns the superset of fields with stage-appropriate defaults.
    Both machines consume it; the panel's inspector state reads one shape.
  deep_dive: no

- id: 1-03
  title: MINI_IP regex is written seven times plus one inline literal; no single source of truth
  severity: Medium
  category: DRY
  files:
    - js/sim/network.js:17
    - js/sim/router.js:15
    - js/sim/browser-seat.js:10
    - js/sim/browser.js:9
    - js/sim/cdn.js:22
    - js/sim/loadbalancer.js:25
    - js/sim/dns.js:27
  evidence: |
    Each file declares its own `const MINI_IP = /^\d+\.\d+$/;` except
    browser.js, which inlines the literal at line 9:
      if (!/^\d+\.\d+$/.test(address)) { ... }
  impact: |
    The repo's signature modeling primitive — the two-number mini-IP that
    every wire address rides — has seven independent definitions and one
    literal. A future change to the address shape (e.g. allowing a host
    token, or rejecting `0.0`) has to land in eight places or silently
    diverge. The inline literal in browser.js also evades a grep for the
    named constant, so a maintainer auditing the rule will miss it.
  recommendation: |
    Add a tiny `js/sim/address.js` that exports `MINI_IP` and
    `assertMiniIp(addr)` and have the seven consumers import. One line each.
    The inline literal in browser.js folds into the same rule.
  deep_dive: no

- id: 1-04
  title: `subnetOf` helper duplicated verbatim across two files
  severity: Low
  category: DRY
  files:
    - js/sim/router.js:17
    - js/sim/trace-stage6.js:46
  evidence: |
    router.js:17   — const subnetOf = (address) => String(address).split('.')[0];
    trace-stage6.js:46 — const subnetOf = (address) => String(address).split('.')[0];
  impact: |
    Same shape as 1-03 but smaller surface. A future change to the subnet
    rule has two sites.
  recommendation: |
    Co-locate with the address helper from 1-03; both consumers import it.
  deep_dive: no

- id: 1-05
  title: engine.js default address literals duplicate router.js's defaults and can desync silently
  severity: Low
  category: DRY
  files:
    - js/sim/engine.js:50-54
    - js/sim/router.js:20-23
  evidence: |
    engine.js:50-54 —
      routerLeftAddress = '10.65',
      routerRightAddress = '20.254',
      cdnAddress = '20.1',

    router.js:20-23 —
      leftAddress = '10.65',
      rightAddress = '20.254',

    engine-stage6.js:36-46 consumes the engine's values but the router's own
    constructor still carries the same literals as its fallbacks.
  impact: |
    The two files agree today because the constants were copied together. A
    future change to one without the other produces a topology where the
    engine's fabric hands the router one seat and the router's own identity
    answer names another — the kind of silent desync the fail-loud contract
    is supposed to prevent.
  recommendation: |
    Pick one home (router.js is the natural one for its own seat; a small
    `addresses.js` for the stage-6 fabric triple). The other file imports.
  deep_dive: no

- id: 1-06
  title: `snapshot().queue` and `snapshot().files` are pinned to `serverSnapshots[0]` — an implicit stage-1 assumption
  severity: Medium
  category: architecture
  files:
    - js/sim/engine.js:280-281
  evidence: |
    const queueDepth = serverSnapshots.reduce((sum, s) => sum + s.queueDepth, 0);
    const served     = serverSnapshots.reduce((sum, s) => sum + s.served, 0);
    ...
    queue: serverSnapshots[0].queue,
    files: serverSnapshots[0].files,
  impact: |
    In stages 2/3/4/5/6 the pool has two backends. `queueDepth` and `served`
    correctly pool both, but `queue` and `files` reflect backend 10.11 only.
    A `setWebFile('10.12', ...)` edit (pinned in engine.test.js:179-185)
    changes `servers[1].files` but leaves `snapshot().files` showing the
    stale 10.11 view until the learner happens to ask a 10.11 path. The
    panel's fs-editor (chunk 5) and the inspector source view read
    `snapshot().files`; the divergence is already load-bearing for the UI
    contract, and adding a Stage 7 with more backends would compound it.
  recommendation: |
    Either expose `queue` and `files` as pool-aggregate views (e.g. merged
    file map with per-address provenance) or rename the fields to
    `primaryQueue`/`primaryFiles` plus a `servers[i].queue`/`files` so the
    UI has to pick a backend explicitly. The implicit "backend 0 is
    special" assumption should not be baked into the snapshot shape.
  deep_dive: no

- id: 1-07
  title: engine.js (298 LOC) and trace.js (294 LOC) are two and six lines below the production guard
  severity: Low
  category: code-quality
  files:
    - js/sim/engine.js
    - js/sim/trace.js
  evidence: |
    wc -l: engine.js 298, trace.js 294. guard-file-size.mjs fails prod
    modules over 300.
  impact: |
    Any future change to either file — even a one-line comment — risks
    tripping the guard and forcing a split under pressure. The trace.js
    stage-5 conditions already read as an if/else ladder whose next stage
    would push it over; engine.js's constructor + step + snapshot is the
    same shape. The guard is doing its job, but the files are standing
    exactly where the job becomes a maintenance tax.
  recommendation: |
    Not urgent, but the next touch to either file should preemptively
    extract a cohesive slice (engine.js's `snapshot()` subtree assembly is
    a candidate; trace.js's stage-5 ladder already lives next to the stage
    6 hand-off and a stage-specific extraction could mirror trace-stage6.js
    for symmetry).
  deep_dive: no

- id: 1-08
  title: chainStep's LB-hop frame is the third copy of an LB-enqueue narration, and the only one without skip support
  severity: Medium
  category: DRY
  files:
    - js/sim/trace.js:168-172
    - js/sim/trace-stage6.js:135
    - js/sim/trace-helpers.js:55-59
  evidence: |
    trace.js:171 uses hops.lbEnqueuedFrame(serverAddress, target,
    trace.request, skippedAt) — the shared helper.
    trace-stage6.js:135 inlines `LB ${serverAddress} -> ${target}
    (${trace.request}) queued` — no skippedAt parameter, so the skip
    narration the helper supports cannot ride the frame.
    trace-helpers.js:55-59 defines the canonical helper, with the
    `skippedAt ? ... skipped` branch.
  impact: |
    Even setting aside 1-01's refusal divergence, the skip story the LB's
    health-aware cursor is meant to teach is muted on stage-6 hosted
    traces. The learner watching a stage-6 run where one backend is down
    sees a clean "queued" frame where stages 2-5 narrate the skip. A
    maintenance change to the LB frame template in trace-helpers.js would
    not reach the stage-6 path.
  recommendation: |
    Subsume this into the 1-01 recommendation — a shared `lbEnqueueHop`
    helper in trace-helpers.js whose frame is the single implementation
    both machines call.
  deep_dive: no
```

## Praise

```yaml
- id: 1-P01
  title: Determinism contract is real and well-pinned
  severity: Praise
  category: logic
  files: [js/sim/rng.js, js/sim/engine.js:63, js/sim/users.js:34-44, test/sim/engine.test.js:5-29]
  evidence: |
    rng.js is 11 lines of mulberry32; the only `Math.random` mention in
    js/sim/** is the prohibition comment (rng.js:2); users.js's draw is
    the single RNG consumer; the engine constructs the RNG once at
    engine.js:63; the seed-replay test (engine.test.js:17-29) runs 50
    ticks twice with seed 7 and asserts equality, plus a negative case
    with seed 8.
  impact: |
    The project's entire test-stability claim rests on this. It holds:
    no wall-clock reads, no timers, no hidden randomness, one consumer,
    and the pin is the very first non-trivial test in the suite.
  deep_dive: no

- id: 1-P02
  title: Network's single-funnel refusal choke point is the right abstraction
  severity: Praise
  category: architecture
  files: [js/sim/network.js:42-45, js/sim/network.js:61-82]
  evidence: |
    `refusalOf({ from, to, request })` is the ONE place a refusal record
    is minted; both `send` and `deliverToQueue` consult `server.isDown?.()`
    BEFORE touching the host's methods, and the refusal record rides back
    out through the same shape. The tally is kept at the same funnel.
  impact: |
    The B-6 / B-6b refusal story is teachable because the wire record's
    shape cannot be invented in two places. The trace machine's refusal
    branch consumes this exact record; the browser's receiveRefusal card
    consumes it; the snapshot's refusedCount reads from the funnel. One
    funnel, one shape, one tally — the contract is what makes the fault
    stories possible.
  deep_dive: no

- id: 1-P03
  title: trace-helpers.js extraction is the right seam and the helpers are pure
  severity: Praise
  category: architecture
  files: [js/sim/trace-helpers.js]
  evidence: |
    drainUntilYou, backendFor, serveInto, finishTo, lbEnqueuedFrame,
    lbRefusedFrame, workerTailFrame, dbHopFrame, serveCacheSuffix — each
    is a pure function of its inputs plus the live trace, no hidden state,
    no engine closure captures.
  impact: |
    This is the seam that 1-01 and 1-08 should have been pulled through
    completely. The fact that the seam exists — and that the divergence is
    limited to the LB-hop site that could drop into it next — is what
    keeps 1-01 at High rather than Critical.
  deep_dive: no

- id: 1-P04
  title: engine-faults.js is a model of fail-loud consistency
  severity: Praise
  category: code-quality
  files: [js/sim/engine-faults.js]
  evidence: |
    Every setter routes to the component's OWN state, every setter throws
    on a missing component (fail-loud under its stage), and nothing here
    caches a second opinion. The `snapshot()` reads every fault flag back
    from the component (engine.js:264-278), so the fault's visible effect
    and the fault's flip share one source of truth.
  impact: |
    Five faults, five symmetric setters, one consistent rule — the shape
    the modeling contract demands and the kind of boring correctness that
    makes the teaching value of each fault legible.
  deep_dive: no

- id: 1-P05
  title: browser-seat.js is additive and inert for stages 1-5, exactly as the contract demands
  severity: Praise
  category: architecture
  files: [js/sim/browser-seat.js]
  evidence: |
    A Set-backed idempotent registry that registers a left-network answer
    seat on demand; throws on an invalid mini-IP; the engine only calls
    it when stage ≥ 6 (engine.js:213).
  impact: |
    Stage 6b's cross-subnet response delivery needs a real resolvable
    seat on the left network, and this module provides it without
    changing the stages 1-5 story. Additive and inert is the exact
    criterion AGENTS.md sets for stage-introducing machinery.
  deep_dive: no

- id: 1-P06
  title: engine.test.js pins the stage-6 trace with named counter-examples at the right granularity
  severity: Praise
  category: test-contract
  files: [test/sim/engine.test.js:62-148, test/sim/engine.test.js:195-352]
  evidence: |
    The DNS prelude test (line 62) walks all 9 frames byte-for-byte. The
    host-less counter-example (line 94) pins the 8-hop stage-5 shape on
    stage 6 with the explicit "dns.lookups === 0" check. The NX test
    (line 123) pins that no GET is emitted AND that the next traceHop
    restarts cleanly at hop 1. The MISS/HIT/POST trio at line 195+ pins
    ledger behaviour, edge counters, router.routed count, and the
    browser's actual rendered body.
  impact: |
    These pins are what make 1-01's divergence detectable in the first
    place — the framework for catching it on the stage-6 LB-refusal path
    already exists in the suite's style.
  deep_dive: no
```

## Summary

- **Top finding:** 1-01 (High) — `trace-stage6.js` `chainStep` re-implements
  the LB hop and silently drops both the B-6b refusal branch and the skip
  narration that `trace.js` faithfully handles. In an all-down stage-6 pool
  the trace walks on with `[object Object]` as its target and a phantom
  served record instead of aborting with the refusal card the stage-2..5
  machine would have shown. This is the DL-3 "two machines, two stories"
  defect the modeling contract warns about, and it is reachable through the
  existing fault console.
- **Medium findings:** 1-02 (two `freshTrace` vocabularies), 1-03 (MINI_IP
  regex duplicated across **seven** files plus an inline literal — brief
  understated this), 1-06 (`snapshot().queue`/`files` pinned to
  `serverSnapshots[0]`, already load-bearing for the panel's fs-editor
  view), 1-08 (the LB-frame copy that lacks skip support).
- **Low findings:** 1-04 (`subnetOf` duplicated), 1-05 (address-default
  literals duplicated engine.js ↔ router.js), 1-07 (engine.js and trace.js
  are two and six lines below the production guard).
- **No Critical findings.** Determinism, RNG hygiene, the refusal funnel,
  and the audit-trail property of trace frames all hold. Trace texts are
  minted from real component records, not hardcoded stories.
- **Deep-dives used:** none. The divergence in 1-01 is unambiguous once the
  LB's return shape is read; I judged it directly rather than delegate.
- **Brief-vs-code mismatches:** three flagged at the top of the report —
  MINI_IP count (4 stated, 7+1 actual), `users.js` `i >= 0` direction
  (brief said it excludes 10.2; code includes it), and the
  `chainStep` "byte-identical" characterization (refusal-branch divergence
  was flagged in the brief but the skip-narration divergence was not).

## Deep-dive requests (orchestrator dispatch)

_None — the items I would have delegated (the severity calibration of 1-01
and the divergence audit of chainStep vs trace.js's stage-5 ladder) were
resolvable by reading `loadbalancer.js`'s enqueue return shape directly.
If the orchestrator wants a second opinion on whether 1-01 should be
Critical rather than High, the targeted prompt would be:_

> _"Read `js/sim/trace.js:147-172`, `js/sim/trace-stage6.js:119-136`, and
> `js/sim/loadbalancer.js:118-134`. With both stage-6 backends down, a
> `traceHop` call reaches `chainStep` s5 === 2; `lb.enqueue` returns the
> refusal record; `trace.targetServer` is assigned that record (an object,
> not a string). Judge: does this break the AGENTS.md modeling contract
> ('trace/UI narratives must consume the components' actual messages, not
> a hardcoded story') hard enough to be Critical, or is High the right
> severity because the happy path's audit-trail property still holds?"_

### Deep-dive 1-01 severity calibration (dispatched by orchestrator, `opencode-go/gemini-4-argon`)

**Verdict: High — do not escalate to Critical.**

1. **The defect is real in `trace-stage6.js`:** `js/sim/trace.js:153-172` handles `lb.enqueue` returning a refusal record (`target?.refused === true`) and `lb.lastSkip()`; `js/sim/trace-stage6.js:126-135` omits both checks (`trace.targetServer = target`), and `trace.js:45-62` never passes `onRefusal` into `createStage6Trace`. With both stage-6 backends down, `target` is `{ from, to, request, response: null, refused: true }` (`loadbalancer.js:133`), yielding `LB 10.1 -> [object Object] (...) queued`, falling back to `servers[0]` (`trace-helpers.js:30`), and rendering `[object Object]` in `js/panel/model-stage5-chain.js:18,30,62`.
2. **Trigger is programmatic/API-only, not UI-reachable:** the Fault Console carries one fault per stage (`js/panel/fault-console.js:25-105`); stage 6 exposes only `dns-dropped` (`fault-console.js:90-104`), and stage 2 exposes a toggle for `10.12` only — never `10.11`. No UI surface can down both stage-6 backends; triggering requires calling `engine.setServerDown(...)` directly.
3. **Why High, not Critical:** the map reserves Critical for active breaks in the _reachable_ correctness contract. `trace-stage6.js` drifted from `trace.js`'s B-6b LB handler (trace.js:164-172) during the stage-6 file-size split — a High maintenance/architecture hazard that becomes Critical the moment multi-fault or cross-stage server-down toggles are exposed in the UI.
