# R2e — engine snapshot-assembly extraction (R5e's engine half, brought forward)

Rationale (R5e pull-forward): engine.js is at exactly 300/300 and three
consecutive slices (R2b/R2c/R2d) have engineered at the cap — the R2c
CHECKS line and R2d's registry key each cost an emergency line-payment
(fabric-collapse, comment merge). The remaining planned ladder (Stage R3:
TRACE_VOCAB, mirrors, hop-targets) touches trace.js and the panel, never
engine.js — but two R-slices already needed surprise schema surgery on this
file, and Stage R7 would force it. Extracting the most cohesive seam now
(chunk-1 finding 1-07's exact recommendation: "the engine's snapshot()
subtree assembly is a candidate") buys ~45 lines of standing headroom for
zero behavior change, guarded by the strongest pins in the repo (the
engine snapshot's shape is asserted by the engine.test suite, the panel
consumers, and pool-truth.test.js — all byte-exact).

## Repo rules (bound, hard)

- NEVER weaken a guardrail, test, or manifest rule. Zero runtime deps.
- File sizes: engine.js ends ≤ 260 (from 300); the new assembly file
  ≤ 200. Behavior byte-identical — the snapshot record's KEYS and VALUES
  are the contract; the existing engine.test pins, pool-truth.test.js's
  pool-truth pins, and the R2c provenance keys are the proof set.

## Boundary contracts (Step 2)

### 1. js/sim/engine-snapshot.js (new, ~85 LOC)

- `export function buildEngineSnapshot(deps)` — deps (all live engine
  state, passed explicitly, no closures): `{ stage, tick, servers, lb,
cache, database, workerQueue, dns, router, edge, network,
registryIn, lastExchange, lastMatchedRoute, lastFrame, clientBrowsers }`
  — where registryIn is the `buildRegistry(stage)` result imported inside
  the assembly module (the module imports buildRegistry from
  './registry.js' directly — engine.js does not pass it).
- The moved code: the engine.js snapshot() body lines 241-297 verbatim —
  serverSnapshots composition, queueDepth/served/avgLatencyTicks pooling,
  the B-6 tally block (skippedCount/bypassedCount/failedWrites/primaryDown/
  crashed/redelivered), the primaryQueue/primaryFiles pair + the R2c
  CHECKS lineage comment, the per-component shape block, lastFrame/
  browserDisplay/browsers/trace keys. All CHECKS comments move with their
  code (the two R2c/R2b lineage CHECKS at the primaryQueue pair and the
  B-6 tally notes).
- The returned record's keys: byte-identical set and order to today.

### 2. engine.js delegates

- `snapshot() { return buildEngineSnapshot({ stage, tick, servers, lb,
cache, database, workerQueue, dns, router, edge, network,
lastExchange, lastMatchedRoute, lastFrame, clientBrowser }); }` — ONE
  call expression. engine.js ends ≤ 260.
- Careful: `clientBrowser` is the singular named closure (their
  `last()` is the browserDisplay source) — pass it, do not rename.
- The B-6 fault setters and the OTHER engine surfaces stay in engine.js
  (step(), traceHop, setWebFile, setUsers, createFaultSetters spread).

### 3. Shape-stability pin (the acceptance proof)

- test/sim/pool-truth.test.js gains ONE new pin (file has headroom, 26
  LOC → +~12), title verbatim:
  `the engine snapshot's key set is contract-stable across the engine-snapshot assembly extraction — no shape evolved in this slice`:
  stage-1 + stage-2 createEngine; for each, assert `Object.keys(snap)` deep-equals the literal ordered key list captured today (`['stage','registry','tick','users','serverAddress','queueDepth','served','avgLatencyTicks','refusedCount','skippedCount','bypassedCount','failedWrites','primaryDown','crashed','redelivered','lastExchange','primaryQueue','primaryFiles','servers','loadBalancer','cache','database','workerQueue','dns','router','cdn','lastMatchedRoute','lastFrame','browserDisplay','browsers','trace']` — run the engine FIRST if the order drifts, pin exactly what is, and keep it). CHECKS: names the extraction + the shape-stability rule.

### 4. No test re-pointing, no behavior change

- The engine.test suite, pool-truth.test.js's existing pins, and the
  panel consumers (inspector-state/render/model) all read
  `engine.snapshot()` — none of them import the new module. NOTHING is
  re-pointed; the proof is the suite itself.

## §Tests

- The keys pin (contract 3) is the only new test body; titles byte-for-
  byte verbatim (storymap ref).

## Manifests same-change

- storymap.yaml: ONE story under the SIM slice titled verbatim per
  contract 3's title + refs to (this pin, pool-truth.test.js's existing
  two pins). slices.yaml: same refs under the SIM tests list.

## Ticks

- [x] Step 1 (Lead session): human design sign-off (2026-11-02; R5e
      pull-forward for the engine.js cap-pressure ledger).
- [x] Step 2 (Executor sub-agent): cold implementation; `npm run verify`
      green; tick and commit.
- [x] Step 3 (Lead session): `npm run metrics:extract -- ses_e61b5825dffeoEhUK4FHsDTDQI`, entry `R2E-SNAPSHOT-ASSEMBLY` appended, ticked, committed. Original contract: `npm run metrics:extract -- <sessionID>`,
      append entry `R2E-SNAPSHOT-ASSEMBLY`, tick, commit.
