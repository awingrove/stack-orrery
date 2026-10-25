# Stage 6b — CDN edge at 20.1: pull-origin on miss through the Router, TTL serve on hit

**For agentic workers:** read `AGENTS.md`, `FACTORY.md`, and `DESIGN.md` first; execute Step 2 mechanically with `npm run verify` green at every commit.

## Hard rules

- **NEVER** weaken a guardrail, test, threshold, or manifest rule. Zero runtime deps; no inline handlers/styles (CSP); `js/sim/**` deterministic; strict `CHECKS:`/`PINS:`/`DOCUMENTS:` vocabulary.
- **File size:** js/css ≤ 300 (`trace-stage6.js` at ~220 — see §3), tests ≤ 450, `panel.html` ≤ 550 (sits at 546; never delete a pinned testid to fit — split JS instead).
- **Same-change manifests:** `slices.yaml` + `storymap.yaml` with the feature.
- **Stages 1–6a stay byte-identical:** every narrative, hop frame, and pin for shipped paths (host-less, `example.com`, NX) passes unchanged.

## Negative-case contracts (DL-3/DL-4)

- **Edge TTL branch.** `lookup(path)` inside `ttlTicks` serves the fill ledger: no origin traffic, `hits` increments. A miss or expired entry never answers from the ledger; the pull does a REAL `lb.enqueue` + backend `drainUntilYou` through the home network's **Cache** (cache-aside stays in the loop), then calls `fill`. Named counter-example: an expired edge entry must NOT be served from the ledger (mirror `dns.js`'s expired-entry pin).
- **Stale-at-the-edge branch.** Editing an origin file within the edge TTL changes nothing at the edge: a subsequent GET still serves the OLD bytes until TTL expiry; after expiry the pull serves the NEW bytes (the staleness rule the origin Cache obeys — the editable-fs lesson compounds).
- **GET-only pass-through.** Any non-GET on a CDN name never touches the edge ledger: pulled to the origin verbatim (`misses`/`fills` untouched, ledger row absent). Named counter-example: a POST must not fill the edge.
- **Fail-loud seats.** Router re-seats at `10.65 ⇄ 20.254`; edge owns `20.1`; unregistered `20.x` (`20.9`) still throws `network: no server at 20.9`.
- **Trace-shape branch.** CDN GETs are their own shape: HIT = 6 hops, MISS = 9, both ending in the browser render; POST pass-through rides the MISS shape's origin leg. Named counter-example: a CDN HIT must NOT replay the 9-hop hosted-home chain, and stage-6a shapes (`example.com` 9 / host-less 8 / NX 2) are byte-identical.

## Pre-decided boundary contracts

### 1. `js/sim/cdn.js` (new component)

- `createCdnEdge({ address = '20.1', ttlTicks = 10, originAddress = '10.1' } = {})`: validates mini-IP + positive-integer TTL (fail-loud, cache.js precedent).
- `lookup(path, currentTick)` → `{ status: 'HIT' | 'MISS' }` after evicting expired entries (alive-through-ticks: filled at T, responsive through `T + ttlTicks − 1`).
- `fill(path, body, currentTick)` — validated non-empty string; the trace machine calls it after a real origin pull.
- State `{ hits, misses, fills, lastPull, ledger: [{ path, body, expiresAtTick, ttlRemaining }] }`; deterministic.

### 2. `js/sim/dns.js` + `js/sim/router.js` re-seat

- DNS authoritative table gains `cd.example.com -> 20.1` (second static entry; no behavior change — every existing pin keeps passing).
- Router default `rightAddress` becomes `20.254` (edge takes `20.1`); the router still registers its own seat on the right network; `right.send` to `20.254` returns `200 Router 10.65 ⇄ 20.254`.

### 3. `js/sim/engine.js` + trace narrative

- Stage 6 instantiates the edge (`cdnAddress` option, `edgeTtlTicks = 10` default) and registers it on the right network at `20.1` (engine holds the rightNetwork reference); `snapshot.cdn` exposes the edge.
- `createStage6Trace` receives the edge + existing `lb`/`servers` accessors; branch keyed on the DNS answer's subnet: subnet 20 → the CDN chain, else today's chain untouched. If `trace-stage6.js` would pass the 300-line cap, split the CDN chain into a sibling module the stage-6 machine delegates to (no narrative change).
- **HIT (6 hops):** 1 ask `10.2 -> 10.60 | who is cd.example.com?` · 2 answer `20.1` · 3 `10.2 -> 10.65 | GET /about (to 20.1)` — real `router.forward`, `routed` +1 · 4 `20.1 -> 10.65 | 200 <body> (edge HIT, ttl Nt)` · 5 `10.65 -> 10.2 | 200 <body> delivered` — reverse crossing, `routed` +1 · 6 browser render (real `onFinish`).
- **MISS (9 hops):** 1–3 as above · 4 `20.1 -> 10.65 | MISS — pulling origin 10.1 via router` · 5 pull `forward` into subnet 10 (`routed` +1) · 6 LB `10.1 -> 10.11 (GET /about) queued` — real `lb.enqueue` · 7 origin serve `10.11 -> 10.65 | 200 <body> (cache <status>)` — real `drainUntilYou` · 8 edge fills + reverse crossing delivers the response to `10.2` (`routed` +1) · 9 browser render.
- POST on a CDN name = the MISS shape minus the fill: the origin answer rides 5–7 back to `10.2` with no ledger write (frame may note why).

### 4. UI (`js/panel/**`, `stage6-registry.js`, `index.html`, `teaching.js`)

- `layout-stage6.js`: Stage 6 → 9 rings (`ring-cdn` between `ring-dns` and `ring-clients`: `RING 8 · CDN EDGE`, BROWSERS → 9; edge node at its own angle; camera fit recomputes via the `boundY` pattern).
- `stage6-registry.js`: `#node-cdn` card, ip-chip `20.1`, `#cdn-stats` (`Hits: n · Misses: n · Fills: n · TTL: <edgeTtl>t`) + `#cdn-entries-list` rows (`path · ttl Nt`) — lazy lookups like the DNS card; inspector source/state gain the cdn section.
- `teaching.js` `STAGE_TEACHING[6]`: replace "nothing is there yet (CDN edge is Stage 6b)" with the edge story (try: edit the origin file, then compare `example.com/about` vs `cd.example.com/about` until the edge TTL expires); `index.html` stage-6 copy drops "named as coming next" — the stage completes.

### 5. Tests & manifests

- `test/sim/cdn.test.js`: HIT/MISS/pass-through branches incl. all counter-examples; eviction math.
- `test/sim/router.test.js`: re-seat pins (`20.254` seat, `20.9` throw, unchanged passthrough).
- `test/sim/engine.test.js`: edge wiring (`snapshot.cdn`), trace-shape pins (HIT `Hop 6/6`, MISS `Hop 9/9`), POST pass-through (edge counters unchanged).
- `test/panel/model-stage6.test.js`: narrative pins for the new hop frames.
- `e2e/cdn-edge.spec.js` (NEW): `should resolve cd.example.com and serve an edge HIT through the Router (6 hops)`; `should pull the origin through the Router on an edge MISS and fill the ledger (9 hops)`; `should keep an origin edit stale at the edge until the TTL expires` (counter-example); `should pass a POST through to the origin without filling the edge`. Assertions read the real cards (`#cdn-stats`, `#cdn-entries-list`, `#journey-log`, router `routed`).
- `slices.yaml`: SIM js adds `js/sim/cdn.js`; PANEL e2e adds `e2e/cdn-edge.spec.js`; `storymap.yaml`: SIM-6 / PANEL-6 rows gain these titles (names identical); stage-6a rows stay put.

## Execution steps

- [x] Step 1 (Lead session): human design sign-off (6b scope set 2026-10-24; "proceed" 2026-10-25) committed in `DESIGN.md` (9-ring registry, Router re-seat, CDN Edge component contract) and this brief.
- [ ] Step 2 (Executor sub-agent): cold implementation, unit & e2e tests, manifest updates, green `npm run verify`; tick and commit.
- [ ] Step 3 (Lead session): run `npm run metrics:extract -- <subagentSessionID>`, append entry to `docs/factory/slice-metrics.yaml`, tick Step 3, commit.
