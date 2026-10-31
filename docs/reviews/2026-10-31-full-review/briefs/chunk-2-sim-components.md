# Chunk 2 — Sim components — Context Brief

## Component inventory

- `js/sim/webserver.js` — `createWebServer({address, serviceRate, files, cache, database, workerQueue})`: FIFO queue + in-memory fs Map + latency window (last 50); exports `matchRoute`, `handleRequest`, `resolveRequest`, `step(currentTick)`, `writeFile`, `setDown/isDown`, `enqueue`, `metrics`, `filesSnapshot`, `queueSnapshot`, `bypassedCount`, `failedWrites`. Consumes wire records `{id, atTick, from, to, request, isYou}`; emits the full record plus `<status> <body>`.
- `js/sim/webserver-helpers.js` — pure helpers: `parseRequest` (splits `"GET /path"`), `routeIdFor` (`route-home` / `route-<path>`), `matchFsRoute(fs, request)` (fs Map lookup → `200 <body>` / `404 Page not found` / `405 Only GET requests are supported`), `writeAcceptedRecord` (200 INVALIDATE WRITE), `writeDownRecord` (503 WRITE_DOWN).
- `js/sim/database.js` — `createDatabase({primaryAddress, replicaAddress, replicationLagTicks, rows})`: primary + replica Maps of `{key, value, version, updatedAtTick}`, FIFO `replicationQueue`, `read` (replica, stale = version compare), `write` (primary + queue), `stepReplication`, `setPrimaryDown/isPrimaryDown`, `snapshot`, `rowsSnapshot`.
- `js/sim/cache.js` — `createCache({address, ttlTicks})`: entries Map `{key, value, cachedAtTick, expiresAtTick}`, `has/get/set/del`, `evictExpired`, `setBypass/isBypass`, `snapshot` with `ttlRemaining`.
- `js/sim/cdn.js` — `createCdnEdge({address='20.1', ttlTicks, originAddress='10.1'})`: GET-only ledger Map `{path, body, filledAtTick, expiresAtTick}`, `lookup` (HIT/MISS), `fill(path, body, tick)` (fail-loud on empty strings), `snapshot`.
- `js/sim/cdn-chain.js` — `createCdnChain({cdn, router, lb, servers, bumpTick, getTick, onServe, onFinish, getTrace})`: stage-6b trace hop machine, hops 3–9; HIT = 6 hops, MISS/non-GET = 9; wildcards `t.edgeStatus`, `t.targetServer` on the caller's live trace object.
- `js/sim/loadbalancer.js` — `createLoadBalancer({address, backends, network})`: round-robin cursor `nextIndex`, health via `network.resolve().isDown()`, `selectBackend` (one bounded pass, skip tally), `handleRequest` (sync send) / `enqueue` (queue delivery), `nextBackend`, `skippedCount`, `lastSkip`, `snapshot`.
- `js/sim/queue.js` — `createWorkerQueue({address='10.40', workerAddress='10.41', jobDurationTicks})`: `jobs` array FIFO, one `activeJob`, `enqueue(path, payload, tick)` → `{jobId, path, payload, status:'queued', queuedAtTick}`, `step(database, tick)` (write on completion), `setCrashed/isCrashed`, `redelivered/redeliveredCommits`, `pendingCount`, `snapshot`.
- `js/sim/dns.js` — `createDns({address='10.60', ttlTicks=300})`: authoritative answers Map (`example.com→10.1`, `cd.example.com→20.1`) + ledger Map; `lookup` (HIT/AUTH/NX + `source`), `setDropped/isDropped` (B-6f purge of both tables), `snapshot` with dropped counters.
- `js/sim/engine-faults.js` — `createFaultSetters({stage, servers, cache, database, workerQueue, dns})`: `setServerDown`, `setCacheBypassed`, `setDatabasePrimaryDown`, `setWorkerCrashed`, `setDnsDropped` — pure redirects to components' own setters; fail-loud when the component is absent for the stage.
- `js/sim/engine-pool.js` — `createServerPool({stage, serverAddress, serviceRate, backendAddresses, cache, database, workerQueue, network})`: stage 1 = one server; stage ≥2 = backend pool + LB, all registered on the network. Returns `{servers, lb}`.
- `js/sim/engine-stage6.js` — `createStage6Fabric({leftNetwork, ...})`: builds right network, DNS, Router (`10.65 ⇄ 20.254`), CDN edge; registers a placeholder CDN seat handler on the right network. `fabricForStage(stage, config)` returns null below stage 6.

## Mechanism-vs-probability audit facts

- webserver.js — hit path is real data structures: fs Map via `matchFsRoute` (webserver-helpers.js:28-29), cache via `cache.get(path, currentTick)` (webserver.js:112). No rng anywhere; determinism comment at webserver.js:2-5.
- cache.js — real Map lookup + tick math: `evictExpired` iterates entries and deletes `currentTick >= expiresAtTick` (cache.js:35-42); `get` consults `entries.get(key)` after eviction (cache.js:65). No rng.
- database.js — stale is a version comparison on the read path: `stale = Boolean(primaryRow && (!replicaRow || replicaRow.version < primaryRow.version))` (database.js:81); replication drains FIFO by `currentTick >= replicationQueue[0].applyAtTick` (database.js:62). No rng.
- loadbalancer.js — cursor arithmetic `(nextIndex + 1) % pool.length` (loadbalancer.js:76,81); health consult is `network?.resolve?.(candidate)` → `isDown` (loadbalancer.js:52-55). No rng.
- queue.js — real FIFO `push`/`shift`/`unshift` (queue.js:59,79,136); completion by tick math `currentTick >= activeJob.finishesAtTick` with `finish = start + jobDurationTicks` (queue.js:114,141). No rng.
- dns.js / cdn.js — both ledgers are Maps with `expiresAtTick` eviction loops (dns.js:53-59; cdn.js:43-49); branch choice is `ledger.get/has` (dns.js:80; cdn.js:57). No rng.
- Grep for `Math.random`/`Date.now`/`rng` across the 12 files: zero occurrences.

## Stage layering facts

- Stages: webserver=1; loadbalancer=2; cache=3; database=4; queue=5; dns=6a; cdn+router fabric=6b.
- engine-pool.js: stage-1 branch bypasses the LB entirely (engine-pool.js:23-27); stage≥2 creates backends first, then the LB, registering every address (engine-pool.js:28-34). One file-level duplication across branches: `createWebServer` call shapes differ (shared cache/database/workerQueue only in the ≥2 wiring).
- webserver-helpers.js is pure extraction from webserver.js (comment webserver-helpers.js:1-7); no state, no behavior change claimed.
- engine-faults.js routes into five components' own setters; the comment chain names B-6…B-6f per fault; unknown-address and below-stage flips both throw (engine-faults.js:16-21, 27, 37, 50, 63).
- engine-stage6.js builds the 6b fabric; the CDN seat handler on the right network is a literal placeholder (`handleRequest: () => "200 CDN edge ..."`, enqueue = identity) (engine-stage6.js:47-50) — the trace machine drives the real edge via `lookup`/`fill`.
- cdn-chain.js vs trace-stage6.js/trace-helpers.js: trace-stage6 owns DNS prelude + stage-5 chain (imports `drainUntilYou`, `backendFor`, `serveInto`, `finishTo` from trace-helpers.js, trace-stage6.js:36-44); cdn-chain.js re-declares its own `drainUntilYou` + `backendFor` locally (cdn-chain.js:39-49, 47) — factually one duplicated pair vs trace-helpers, plus its own `serve`/`finish`/`deliverResponse` against trace-stage6's `serveInto`/`finishTo`. cdn-chain reads/writes the machine's trace object via `getTrace` closure (cdns-chain's trace() at cdn-chain.js:37).

## Protocol facts

- Requests: `"GET /path"` string only (parseRequest webserver-helpers.js:9-16); workerQueue paths keyed on `/jobs` and `/export` (webserver.js:71).
- Responses: `200 Welcome to the home page`, `201 …` not used; actual shapes: `200 <body>`, `404 Page not found`, `405 Only GET requests are supported`, `503 Write unavailable (primary down)`, `202 {"jobId": N, "status": "queued"}` (webserver.js:78).
- DB/op tokens on records: `cacheStatus` ∈ HIT/MISS/BYPASS/BYPASSED/INVALIDATE/ASYNC/null; `dbOp` ∈ SELECT/WRITE/WRITE_DOWN; `dbTarget` = replica/primary mini-IP; stale flag `dbStale`.
- DNS lookup returns `{status: 'OK'|'NX', target, source: 'cache'|'authoritative'}` (dns.js:87-106) — no HTTP shape; `NX` for unknown names, never a throw (dns.js:90-95).
- CDN wire tokens inside hop narration: `"MISS — pulling origin …"`, `"PASS — <M> <p> is not edge-cacheable"`, `"<200 body> (edge HIT, ttl Nt)"`, `"(edge FILL <path>, ttl Nt)"` (cdn-chain.js:120-146,185-187).
- Mini-IPs: two-number everywhere; constructor regex `/^\d+\.\d+$/` at cache.js:19, cdn.js:25/28, database.js:34, loadbalancer.js:32/38, queue.js:26, dns.js:30. webserver.js takes `address='10.1'` presumably unstated (no regex check on its address — none present).
- Stage 6b wire token after resolution is the mini-IP, not the hostname (cdn-chain.js:113,164 header lines; trace-stage6.js:24-25 comment).

## Test pins

- test/sim/cache.test.js — TTL hit/evict semantics; stage-3 wiring: warm hits cost 1 unit, miss/non-GET cost 2; shared entries across both backends.
- test/sim/cache-bypass.test.js — B-6c: setBypass validation, counters frozen while bypassed, BYPASSED cacheStatus + bypassedCount, cold-rejoin refill, DL-3 counter-example (BYPASSED vs non-GET BYPASS token), same-seed determinism.
- test/sim/database.test.js — replication after replicationLagTicks, stale-read tracking; stage-4 wiring: write→invalidate→stale replica read→catch-up.
- test/sim/dns.test.js — authoritative vs ledger hit vs expiry; stage-6 engine resolves example.com via the trace.
- test/sim/dns-ledger-drop.test.js — B-6f: purge of both tables on the true flip, NX-only droppedLookups, cd.example.com unaffected, re-add on restore + reResolveAfterDrop counts once, engine routing below/at stage 6.
- test/sim/loadbalancer.test.js — strict round-robin distribution, stage-2 capacity doubling, constructor fail-loud on bad addresses/pool/network.
- test/sim/loadbalancer-failover.test.js — B-6b: cursor skip past a down backend, no traffic to the down seat, all-down refusal-record fail-out, trace abort at the LB hop, skippedCount snapshot, deterministic rejoin.
- test/sim/primary-down.test.js — B-6d: flag validation, store untouched while down, real 503 POST (cache keeps serving), failedWrites pool-summed, restore continues version from history, DL-3 counter-example (503 rides normal hops, no refusal card).
- test/sim/worker-crash.test.js — B-6e: flag validation, crashed step drains nothing, ACTIVE job re-queued to head byte-identically, re-timed re-delivery commits once, engine routing below/at stage 5.
- test/sim/queue.test.js — component basics: mini-IP/jobDurationTicks validation, enqueue stats, step duration + database write.
- test/sim/webserver.test.js — queue depth growth, FIFO drain capped at serviceRate + latency, non-positive serviceRate rejection, slim GET routing 200/404/405, wire record round-trip, fs Map serving + routeId null on 404/405, writeFile behavior.
- test/sim/webserver-fault.test.js — setDown validation, unchanged direct handleRequest/enqueue while down, network refusal choke point for down hosts (send + deliverToQueue, refusal-card shape, refusals tally).
- test/sim/cdn.test.js — edge constructor fail-loud, HIT inside TTL / MISS when absent, expired-entry eviction + never answered past expiry, fill path/body fail-loud, pass-through leaves counters/row untouched.

## Risk hotspots

- webserver.js is 299 lines against the 300-line production guard (next: cdn-chain.js 197, database.js 191, queue.js 181, dns.js 172, loadbalancer.js 149, cache.js 142, cdn.js 119, engine-stage6.js 56, engine-faults.js 69, webserver-helpers.js 69, engine-pool.js 35).
- Fault injection is spread across five consulted components + one router (engine-faults.js); each consult branch is documented in-line at the consulted site (webserver.js:93/109, database.js:109, cache.js:60, queue.js:76, dns.js:119; down-host refusal lives in network.js, outside this chunk).
- `drainUntilYou` in cdn-chain loops `server.step()` unbounded until `isYou` or an empty batch (cdn-chain.js:39-45); all-down LB fail-out depends on network-side refusal (loadbalancer.js:112-115).
- `webserver.resolveRequest`'s bypass/lane branch nesting (webserver.js:67-156) is the widest conditional in the chunk; engine-pool stage-1 vs stage≥2 duplication noted above.
- No TODO/FIXME/XXX/HACK markers found in js/sim (grep: zero).
