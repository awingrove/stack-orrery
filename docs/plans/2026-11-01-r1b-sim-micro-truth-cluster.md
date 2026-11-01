# R1b — sim micro-truth cluster: edge lookup body, cdn-chain helper imports, webserver address validation

Paydown for the 2026-10-31 full review findings 2-01, 2-02, 2-03, 2-04
(reports/chunk-2-sim-components.md). Three small, independent truths:
the CDN edge's `lookup` already holds the HIT row's body and forces the
chain into a throwaway `snapshot().ledger.find()`; `cdn-chain.js`
re-declares three trace-helpers byte-identically plus `routeIdFor`
locally; `webserver.js` is the one component whose constructor does not
fail loud on a non-mini-IP address (cache.js:19, cdn.js:25, database.js:34,
loadbalancer.js:32, queue.js:26, dns.js:30 all do).

## Repo rules (bound, hard)

- NEVER weaken a guardrail, test, threshold, or manifest rule. Zero runtime
  deps; no inline handlers/styles; `js/sim/**` deterministic. Strict
  CHECKS:/PINS:/DOCUMENTS: vocabulary.
- File size: prod js ≤ 300. webserver.js sits at 299/300 — the validation
  work must land in webserver-helpers.js (69 lines, the extraction seam),
  never by trimming comments or tests. engine/tests ≤ 450.

## Boundary contracts (Step 2)

### 1. js/sim/cdn.js — lookup hands the caller the HIT body

- HIT branch: `const row = ledger.get(path); hits += 1; return { status:
'HIT', body: row.body };` (the row is already in hand at the existing
  `ledger.has` check — same truth, one reads). MISS branch unchanged:
  `{ status: 'MISS' }`.
- The lookup comment's story gains one sentence: HIT carries the row's
  own bytes so the chain never re-reads the ledger through a throwaway
  snapshot.

### 2. js/sim/cdn-chain.js — imports replace re-declarations

- Delete the three local functions re-declared byte-identically from
  trace-helpers.js: `drainUntilYou`, `backendFor`, (local) `finish` —
  import `drainUntilYou`, `backendFor`, `finishTo` from
  trace-helpers.js; call sites adapt signatures:
  `backendFor(servers, t.targetServer)`; `drainUntilYou(backend,
getTick)`; `finish(t, <addr>, onFinish)` → `finishTo(t, <addr>,
onFinish)` at both sites (cdn.address and the targetServer/origin
  fallback).
- Delete the inline `routeId = t.path === '/' ? 'route-home' : ...` in
  the HIT branch; import `routeIdFor` from webserver-helpers.js and use
  `t.routeId = routeIdFor(t.path)`. The HIT branch then uses
  `result.body` from the lookup return directly — the
  `cdn.snapshot(getTick()).ledger.find(...)` throwaway goes away.
- The local `serve(you)` stays LOCAL (it is a genuine superset of
  serveInto: cacheStatus/dbOp/dbStale/asyncJob ride it); its comment
  states that explicitly so a future DRY pass judges the delta, not a
  vibe.

### 3. webserver address validation, via webserver-helpers.js

- webserver-helpers.js gains: `export function assertWebServerOptions({
address, serviceRate })` — (a) the EXISTING serviceRate positive-integer
  check moves here verbatim (same error message byte-shape); (b) NEW:
  mini-IP validation with the repo's shared regex shape `const MINI_IP =
/^\d+\.\d+$/;` (network.js:17 precedent) — on failure throw
  `webserver: address must be a mini-IP, got ${address}`. Both checks
  carry CHECKS: naming the fail-loud contract and the 2-03 finding.
- js/sim/webserver.js constructor: the two inline
  checks become `assertWebServerOptions({ address, serviceRate
})` — file ends under 300 without trimming anything.

## §Tests

1. test/sim/cdn.test.js — the three HIT pins update to the new contract,
   keeping each test's literal seeded body (titles unchanged, so existing
   storymap refs stay resolvable):
   `expect(edge.lookup('/about', 1)).toEqual({ status: 'HIT', body: <the body that test seeded> })` at lines ~26, ~27, ~54. MISS pins untouched.
2. test/sim/webserver.test.js — new pin:
   `it('throws on a non-mini-IP address at construction (fail-loud, cache/dns precedent)', () => ...` — `createWebServer({ address: '10.1.1' })` throws
   `/address must be a mini-IP, got 10\.1\.1/`; a sibling pin: the
   serviceRate error message is byte-unchanged from today
   (`/serviceRate must be a positive integer/` on `serviceRate: 0`).

## Manifests same-change

- storymap.yaml: ONE story under the SIM slice — `title: 'Sim micro-truth
— the edge lookup hands the caller the HIT body it holds and the
webserver rejects a non-mini-IP address at construction'`, tests: the
  three cdn.test.js HIT refs (existing titles) + the two new
  webserver.test.js refs (verbatim titles).
- slices.yaml SIM slice gains the same test refs alongside the story.
- No register change (findings 2-01..2-04 live in the review artifacts).

## Ticks

- [x] Step 1 (Lead session): human design sign-off (2026-11-01,
      orchestrating session; no DESIGN.md amendment — sim wiring only).
- [x] Step 2 (Executor sub-agent): cold implementation from the
      contracts, tests + manifests + green `npm run verify`; tick and commit.
- [ ] Step 3 (Lead session): `npm run metrics:extract -- <sessionID>`,
      append entry `R1B-SIM-MICRO-TRUTH` to docs/factory/slice-metrics.yaml,
      tick, commit.
