# R1a — stage-6 LB-hop unification: same refusal + skip story as the stage-2..5 machine

Paydown for the 2026-10-31 full review, finding 1-01 (severity High, +1-02,
1-08) — evidence + live repro in docs/reviews/2026-10-31-full-review/reports/
chunk-1-sim-core.md. The stage-6 trace machine re-implements the LB hop
(trace-stage6.js `chainStep` s5===2) without trace.js's refusal branch and
skip narration: an all-down stage-6 pool returns a refusal record from
`lb.enqueue` (loadbalancer.js:118-134), which `chainStep` narrates as
`LB 10.1 -> [object Object] (GET /about) queued` and then walks a phantom
chain. The engine's own stage-2..5 machine handles the same pool state
correctly (trace.js:150-176). Both machines must tell one LB story.

## Repo rules (bound, hard)

- NEVER weaken a guardrail, test, threshold, or manifest rule. Zero runtime
  deps; no inline handlers/styles; `js/sim/**` deterministic (seeded rng via
  js/sim/rng.js, explicit tick advance). Strict CHECKS:/PINS:/DOCUMENTS:
  vocabulary (guarantee words only inside CHECKS:/PINS: paragraphs).
- File size: js ≤ 300 (trace.js is 294 — its stage-5 branch text moves INTO
  the helper, so trace.js must not grow), test ≤ 450 (engine.test.js is
  353). Split if a cap would be crossed — never trim comments or tests to
  fit.
- No PR/approve/merge; features ride this repo's PR flow (human review).

## Boundary contracts (Step 2)

### 1. `lbEnqueueHop` in js/sim/trace-helpers.js (new export)

- Signature: `lbEnqueueHop(trace, { serverAddress, lb, bumpTick, onRefusal })`
  — pure over its inputs plus the live trace object (same seam discipline as
  the existing helpers: trace mutates in place, no engine closures).
- Behavior — the branch text moves byte-shape-identical from trace.js's
  stage-5 LB branch (currently ~152-172):
  - `const atTick = bumpTick(); const target = lb.enqueue({ id:
'you:${atTick}', from: trace.from, to: serverAddress, request:
trace.request, atTick, isYou: true });`
  - If `target?.refused === true`: set `trace.refused = true`, call
    `onRefusal?.(target)`, frame = `lbRefusedFrame(serverAddress, target,
trace.request)`.
  - Else: set `trace.targetServer = target`, frame = `lbEnqueuedFrame(
serverAddress, target, trace.request, lb.lastSkip?.())`.
- Returns `{ frame, refused }`. The helper's header carries the
  DOCUMENTS: + CHECKS: paragraphs (the CHECKS names the named
  counter-examples: all-down → refusal card; one-down → skip narration;
  both-up → clean byte shape).

### 2. js/sim/trace.js (stage-5 branch rewrite + wiring)

- The stage-5 LB branch replaces its inline enqueue/if-else with the helper
  call and returns `frame`.
- The `createStage6Trace(...)` construction passes `onRefusal` through
  (currently omitted — that omission is half the defect); destructuring in
  createStage6Trace gains it. trace.js must finish ≤ 300 lines.

### 3. js/sim/trace-stage6.js (chainStep s5===2 + refusal termination)

- `chainStep(2)` becomes the helper call + returns `frame`; the inline
  'LB ... queued' literal goes away.
- REFUSAL TERMINATION (the phantom-walk half): `step()`'s final-hop
  selection (~180-196, currently `nx → 2 / cdn → 6:9 / host → 9 / 8`)
  gains the refusal state: a refused trace's walk ENDS at hop 3
  (`trace.refused → 3`), mirroring trace.js's refusal-informed final hop
  (~96-98); the next traceHop() then restarts a fresh trace through the
  existing `hop >= finalHop` path. trace-stage6.js must finish ≤ 300.

### 4. Stage-6 trace shape (one vocabulary)

- `freshTrace()` gains `refused: false` with a CHECKS: naming the parity
  contract — snapshot consumers read one `refused` field across stages
  1-6 (finding 1-02's stage-side fix; the full unified freshTrace factory
  is explicitly OUT of scope).

## §Tests (added to test/sim/engine.test.js; titles verbatim — storymap refs)

1. `DL-3 counter-example — an all-down stage-6 pool aborts the trace at the LB hop with the stage-2 machine's refusal card: neither [object Object] nor a phantom chain` — engine stage 6 (a populated 10.2 crowd irrelevant; trace only), both backends `setServerDown('10.11', true)` + `('10.12', true)`, three traceHop() calls on a hosted `/about`: hop 3 frame === `LB 10.1 -> 10.11 | GET /about => connection refused (nothing enqueued)`; `snapshot.trace.refused === true`; the FOURTH traceHop() restarts clean at hop 1 (two pins in one: no [object Object], no phantom hop 4).
2. `the stage-6 all-down refusal frame is byte-identical to the stage-2 machine's for the same request` — build the same all-down scenario on stage 2: its hop-2 frame string === the stage-6 hop-3 frame string from test 1.
3. `a one-down stage-6 pool narrates the crossed seat in the LB frame` — engine stage 6, ONLY backend 10.11 down: hop 3 renders `LB 10.1 -> 10.12 (GET /about) queued — 10.11 is down — skipped`; the healthy-path pin lives in test 2's sibling (no new test).
4. `the stage-6 trace record exposes the same refused vocabulary as stages 1-5` — after a normal (both-up) hosted stage-6 trace completes, `snapshot.trace.refused === false`. (Test 1 already pins `true` on the refusal path.)

## Manifests same-change

- storymap.yaml: ONE story under the SIM slice — the next unused id —
  title `'LB-hop story parity — stage 6 aborts on an all-down pool with the stages 2-5 refusal card and narrates the crossed seat'`;
  tests: the four engine.test.js titles above verbatim.
- slices.yaml SIM slice gains the same story id.

## Ticks

- [x] Step 1 (Lead session): human design sign-off (2026-11-01, orchestrating session; no DESIGN.md amendment — sim wiring only, no visual pattern).
- [x] Step 2 (Executor sub-agent): cold implementation from the contracts, tests + manifests + green `npm run verify`; tick and commit.
- [x] Step 3 (Lead session): `npm run metrics:extract -- ses_e66f88747ffeNNMSjSHGBxbUxn`, entry `R1A-STAGE6-LB-HOP` appended, ticked, committed.
