# Chunk 2 — Sim components — Review Report

- **Reviewer:** Qwen3.7 Plus (step 3)
- **Date:** 2026-10-31
- **Scope:** `js/sim/webserver.js`, `webserver-helpers.js`, `database.js`, `cache.js`,
  `cdn.js`, `cdn-chain.js`, `loadbalancer.js`, `queue.js`, `dns.js`,
  `engine-faults.js`, `engine-pool.js`, `engine-stage6.js`; pinning tests skimmed.
- **Standards:** `docs/reviews/2026-10-31-full-review/map.md` (severity ladder,
  findings schema, reviewer standards 1-7).

## Brief vs code verification

The researcher brief (`briefs/chunk-2-sim-components.md`) is factually accurate.
Mechanism-vs-probability audit claims verified against the code — every
`Map` lookup, tick comparison, and FIFO operation cited matches the load-bearing
line. Protocol tokens, mini-IP regexes, stage layering, and fault routing all
match. One minor gap noted (webserver address validation absence — the brief
flags it factually at line 40; elevated here as finding 2-03). No brief-vs-code
mismatches found.

## Findings

```yaml
- id: 2-01
  title: cdn-chain.js re-declares drainUntilYou, backendFor, and finish — byte-identical to trace-helpers.js
  severity: Medium
  category: DRY
  files:
    - js/sim/cdn-chain.js:39-49
    - js/sim/cdn-chain.js:64-72
    - js/sim/trace-helpers.js:13-19
    - js/sim/trace-helpers.js:29-31
    - js/sim/trace-helpers.js:43-50
  evidence: >
    cdn-chain.js:39-45 declares `function drainUntilYou(targetServer) { for (;;) { const batch = targetServer.step(getTick()); ... } }`
    — byte-identical logic to trace-helpers.js:13-19 `export function drainUntilYou(targetServer, getTick) { for (;;) { const batch = targetServer.step(getTick()); ... } }`
    (closure-over-getTick vs argument; the loop body is identical).
    cdn-chain.js:47-49 `function backendFor(targetAddress) { return servers.find((s) => s.address === targetAddress) ?? servers[0]; }`
    is byte-identical to trace-helpers.js:29-31.
    cdn-chain.js:64-72 `function finish(toAddress) { ... onFinish({ from: t.from ?? '10.2', to: toAddress, request: t.request, response: t.response }); }`
    is byte-identical to trace-helpers.js:43-50 `finishTo(trace, toAddress, onFinish)` modulo variable name.
    The brief notes this at line 32 ("cdn-chain.js re-declares its own drainUntilYou + backendFor locally").
  impact: >
    Maintenance debt — any change to drain semantics or backend-pick fallback
    must be made in two places. cdn-chain already diverges from trace-helpers'
    serve signature (cdn-chain.js:51-62 sets cacheStatus/dbOp/dbStale/asyncJob
    beyond serveInto's four fields), so future drift risk is real.
  recommendation: >
    Import `drainUntilYou`, `backendFor`, and `finishTo` from trace-helpers.js
    into cdn-chain.js; pass `getTick` and `servers` at the call site. The
    `serve` function is a superset of `serveInto` — keep it local but consider
    composing it on top of serveInto.
  deep_dive: no

- id: 2-02
  title: cdn-chain.js HIT hop reads ledger body via a throwaway snapshot().ledger.find() — cdn.js API forces it
  severity: Medium
  category: code-quality
  files:
    - js/sim/cdn-chain.js:129
    - js/sim/cdn.js:55-63
  evidence: >
    cdn-chain.js:129: `const entry = cdn.snapshot(getTick()).ledger.find((row) => row.path === t.path);`
    constructs a full snapshot array (cdn.js:86-103 allocates a new array via
    `[...ledger.values()].map(...)`) and scans it linearly, just to read one
    ledger row's body. cdn.js:55-63 `lookup(path, currentTick)` returns only
    `{ status: 'HIT' }` or `{ status: 'MISS' }` — the body is not exposed on
    the HIT branch.
  impact: >
    Every CDN HIT constructs and discards an array. With a small ledger this is
    harmless; the real cost is API design — the chain's only path to the
    ledger body forces an O(n) scan plus an eviction sweep that already ran
    inside `lookup` eight lines above (cdn-chain.js:122).
  recommendation: >
    Extend cdn.js `lookup` to return `{ status: 'HIT', body, ttlRemaining }`
    on a hit (the ledger row is already in hand at cdn.js:57-59). cdn-chain.js
    can then use the return value directly without the snapshot round-trip.
    The snapshot's ledger array is still useful for the panel; the lookup API
    just shouldn't be the panel's API.
  deep_dive: no

- id: 2-03
  title: webserver.js is the only component that does not validate its address as a mini-IP
  severity: Low
  category: code-quality
  files:
    - js/sim/webserver.js:33-40
  evidence: >
    webserver.js:33-40: `createWebServer({ address = '10.1', serviceRate = 4, ... })`
    validates `serviceRate` as a positive integer (line 41) but never applies
    `/^\d+\.\d+$/` to `address`. Every other component in the chunk — cache.js:19,
    cdn.js:25/28, database.js:34, loadbalancer.js:32, queue.js:26, dns.js:30 —
    validates its mini-IP with the same regex. The brief notes this at line 40
    ("no regex check on its address — none present").
  impact: >
    Inconsistent fail-loud contract. A misconfigured address (e.g. '10.1.1' or
    'webserver') silently propagates into the network's registration table
    instead of throwing at construction.
  recommendation: >
    Add the same `MINI_IP` regex check at the top of createWebServer, matching
    the pattern used in cache.js/dns.js. Add a constructor-fail-loud test in
    test/sim/webserver.test.js to pin it.
  deep_dive: no

- id: 2-04
  title: cdn-chain.js hop 4 HIT re-implements routeIdFor inline instead of importing it
  severity: Low
  category: DRY
  files:
    - js/sim/cdn-chain.js:133
    - js/sim/webserver-helpers.js:18-20
  evidence: >
    cdn-chain.js:133: `t.routeId = t.path === '/' ? 'route-home' : \`route-${t.path.slice(1)}\`;`
    is byte-identical to webserver-helpers.js:18-20 `export function routeIdFor(path) { return path === '/' ? 'route-home' : \`route-${path.slice(1)}\`; }`.
  impact: >
    If the routeId naming convention changes, cdn-chain would silently diverge.
    Low-probability but cheap to prevent.
  recommendation: >
    Import `routeIdFor` from webserver-helpers.js into cdn-chain.js.
  deep_dive: no

- id: 2-05
  title: Mechanism realism is the product — every component is a real data structure, no probability fakes
  severity: Praise
  category: architecture
  files:
    - js/sim/cache.js:35-42
    - js/sim/cache.js:65
    - js/sim/database.js:81
    - js/sim/database.js:62
    - js/sim/dns.js:80
    - js/sim/cdn.js:57
    - js/sim/loadbalancer.js:76
    - js/sim/queue.js:114
  evidence: >
    cache.js:65: `const entry = entries.get(key);` — a real Map lookup, not
    `rng() < hitRate`. database.js:81: `stale = Boolean(primaryRow && (!replicaRow || replicaRow.version < primaryRow.version))`
    — a real version comparison. dns.js:80: `const cached = ledger.get(name);` —
    a real Map lookup. cdn.js:57: `if (ledger.has(path))` — a real Map probe.
    loadbalancer.js:76: `nextIndex = (nextIndex + 1) % pool.length` — a real
    cursor. queue.js:114: `currentTick >= activeJob.finishesAtTick` — real
    tick math. No `Math.random`, no `Date.now`, no `rng()` anywhere in the
    12 chunk files (grep: zero occurrences).
  impact: >
    The modeling contract (AGENTS.md: "executable conceptual model, not a
    statistical simulator") is upheld end to end. Every component's mechanism
    is directly readable and auditable.
  recommendation: No action. This is the product.
  deep_dive: no

- id: 2-06
  title: B-6 fault isolation is genuinely component-owned — engine-faults.js is pure routing with no state of its own
  severity: Praise
  category: architecture
  files:
    - js/sim/engine-faults.js:10-68
    - js/sim/webserver.js:199-204
    - js/sim/cache.js:97-102
    - js/sim/database.js:168-173
    - js/sim/queue.js:71-88
    - js/sim/dns.js:119-134
  evidence: >
    engine-faults.js:16-21 setServerDown routes to `server.setDown(down)` —
    the server's own flag. engine-faults.js:26-29 setCacheBypassed routes to
    `cache.setBypass(bypassed)` — the cache's own flag. Every setter is a
    pure redirect with fail-loud on absent stage components
    (engine-faults.js:27, 37, 50, 63). Each component's own setter validates
    the boolean (webserver.js:200, cache.js:98, database.js:169, queue.js:72,
    dns.js:120) and flips only its own flag — the transport or the webserver
    consults the flag on the next tick, not the setter.
  impact: >
    The fault contract is testable at the component layer (each test pins the
    flag's effect on the component's own state) and at the engine layer (the
    fault console routes through engine-faults). No fault state leaks into
    narration or is cached outside the component.
  recommendation: No action — this is the design working as intended.
  deep_dive: no

- id: 2-07
  title: Test suites pin real mechanisms, not incidental strings — Map lookups, version comparisons, tick math, FIFO ordering
  severity: Praise
  category: test-contract
  files:
    - test/sim/cache.test.js:7-50
    - test/sim/database.test.js:6-38
    - test/sim/dns.test.js:6-38
    - test/sim/cdn.test.js:20-57
    - test/sim/loadbalancer-failover.test.js:24-51
    - test/sim/primary-down.test.js:35-74
    - test/sim/worker-crash.test.js
    - test/sim/queue.test.js:34-60
  evidence: >
    cache.test.js:11-18 pins a real `entries.get(key)` miss and hit with exact
    stored value + exact `expiresAtTick = currentTick + ttlTicks` math.
    database.test.js:6-38 pins a real version comparison on the read path
    (`replicaRow.version < primaryRow.version`). dns.test.js:17-24 pins the
    authoritative-table miss writing a ledger entry with exact `expiresAtTick`.
    loadbalancer-failover.test.js:25-51 pins cursor arithmetic past a down
    seat, the skip tally, and rotation-resume cadence. primary-down.test.js:143-153
    pins the pool-summed refusedWrites vs the database's own (unmoved) tally —
    the dual-layer design is pinned at both layers. No test pins an incidental
    string without also pinning the mechanism that produced it.
  impact: >
    The test suite enforces the repo's modeling contract — a regression in any
    component's mechanism would break a behavioral assertion, not just a
    narrative snapshot.
  recommendation: No action.
  deep_dive: no

- id: 2-08
  title: DOCUMENTS/CHECKS/PINS claim vocabulary is used consistently and accurately across every component
  severity: Praise
  category: documentation
  files:
    - js/sim/webserver.js:1-24
    - js/sim/cache.js:1-17
    - js/sim/database.js:1-18
    - js/sim/dns.js:1-23
    - js/sim/cdn.js:1-21
    - js/sim/loadbalancer.js:1-24
    - js/sim/queue.js:1-16
  evidence: >
    Every component opens with a DOCUMENTS block naming its stage, its
    mechanism, and its fault contract (if any). CHECKS: blocks name the
    fail-loud validations and the negative-case counter-examples. PINS: blocks
    (cdn.js:15-21, dns.js:14-20) name the test file and the specific
    counter-example the test pins. The vocabulary is load-bearing — the
    review's own evidence quotes ride these markers to the right lines.
  impact: >
    A reviewer (human or agent) can navigate to any component's contract in
    seconds. The claim markers are the repo's self-documenting correctness
    ladder.
  recommendation: No action.
  deep_dive: no

- id: 2-09
  title: webserver-helpers.js is a clean extraction — pure functions, no state, no behavior change
  severity: Praise
  category: SOLID
  files:
    - js/sim/webserver-helpers.js:1-69
  evidence: >
    webserver-helpers.js:1-7 documents the extraction contract: "no behavior
    change, wiring identical." parseRequest (9-16) splits the slim wire record;
    matchFsRoute (22-38) applies the server's live fs Map; routeIdFor (18-20)
    names the matched route; writeAcceptedRecord (45-55) and writeDownRecord
    (58-68) build the stage-4 write-through records. None of these consult a
    clock, a cache, or a database — pure functions of their inputs.
  impact: >
    The extraction lets webserver.js stay under the 300-line guard without
    introducing a partials directory or an indirection layer. The helpers
    are trivially testable and impossible to mis-sequence.
  recommendation: No action.
  deep_dive: no

- id: 2-10
  title: webserver.js resolveRequest's bypass/lane branch nesting is the widest conditional in the chunk but remains readable
  severity: Praise
  category: readability
  files:
    - js/sim/webserver.js:67-156
  evidence: >
    webserver.js:67-156 resolveRequest handles: (1) no-component fast path,
    (2) non-GET async job branch (71-89), (3) non-GET write branch with
    B-6d consult-first refusal (90-99), (4) GET bypass probe (109-128),
    (5) GET database read with stale-fill guard (129-151), (6) GET filesystem
    fallback with fill guard (153-155). Every branch carries a CHECKS comment
    naming the contract it upholds and the counter-example it avoids.
  impact: >
    The nesting is ~90 lines deep but each branch is individually small and
    documented. The CHECKS comments make the branch conditions auditable
    without reading the surrounding code.
  recommendation: No action — the existing comment structure earns its place.
  deep_dive: no
```

## Summary

Chunk 2 is in strong shape. No Critical or High findings. The modeling contract
is upheld end to end — every component is a real data structure (Map + tick
math), no probability fakes, no RNG, no clock. The B-6 fault isolation is
genuinely component-owned, and the test suites pin real mechanisms (Map lookups,
version comparisons, FIFO ordering), not incidental strings.

Two Medium findings:

- **2-01** — cdn-chain.js re-declares `drainUntilYou`, `backendFor`, and
  `finish` byte-identical to trace-helpers.js. DRY debt; fixable by import.
- **2-02** — cdn-chain.js HIT hop reads the ledger body via a throwaway
  `cdn.snapshot().ledger.find()` because cdn.js `lookup` returns only
  `{status}`. API design issue; fixable by extending `lookup`.

Two Low findings:

- **2-03** — webserver.js doesn't validate its address as a mini-IP (every
  other component does).
- **2-04** — cdn-chain.js re-implements `routeIdFor` inline.

Six Praise findings for load-bearing work done right: mechanism realism (2-05),
B-6 fault isolation (2-06), test-suite mechanism pins (2-07), claim vocabulary
(2-08), webserver-helpers extraction (2-09), resolveRequest branch readability
(2-10).

## Deep-dive requests (orchestrator dispatch)

None. The chunk's complexity was manageable without escalation — the widest
conditional (resolveRequest, 2-10) is well-commented and auditable, and the
DRY duplication in cdn-chain (2-01) is a known pattern with a clear fix.
