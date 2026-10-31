# Chunk 1 — Sim core — Context Brief

## Layer map

- Bottom layer of the sim: primitives (`network.js`, `browser.js`, `browser-seat.js`, `rng.js`) —
  no imports from other sim files except `browser.js` used by `users.js` (`users.js:6`).
- Mid layer: `users.js`, `router.js` — depend on primitives.
- Top layer: `engine.js` + its extraction modules (`engine-pool.js`, `engine-stage6.js`,
  `engine-faults.js`, `trace.js` → `trace-stage6.js` → `trace-helpers.js`). `engine.js` composes
  components from chunk 2 (`engine-pool.js`, `cache.js`, `database.js`, `queue.js`, `dns.js`,
  `cdn.js`, `cdn-chain.js`, `webserver.js`, `loadbalancer.js`) which are outside this chunk.
- Direction is one-way down: chunk 2 components never import engine/trace; `js/panel/**` imports
  only `createEngine` (`js/panel/panel.js:6`), `createNetwork` (`js/panel/inspector-source.js`),
  `createRouter` (`js/panel/inspector-source-stage6.js`), `createBrowser` (`js/panel/inspector-source.js`).
- No sim file touches the DOM; zero `addEventListener` in `js/sim/**`. Panel drives the engine by
  calling `step()` / `traceHop()` / snapshot reads.

## Per-file inventory

- `engine.js` (298): exports `createEngine({seed, users, serviceRate, arrivalProb, stage 1-6, + per-component
mini-IP/tick defaults})`. Owns the clock (`tick` closure), the tick loop (`step()`, L167-199), the
  interactive trace entry `traceHop()` (L209-217), `setUsers`, `setWebFile`, fault setters via spread
  of `createFaultSetters` (L239), and the full `snapshot()` (L241-296). Imported by `panel.js` and 12
  test files.
- `trace.js` (294): exports `createTraceMachine(...)` — the stages 1-5 hop-by-hop state machine; one hop
  per `step()` call (L95-288), restarts when `trace.hop >= finalHop` (L100); delegates stage 6 to
  `createStage6Trace` (L45-63). Imported only by `engine.js`.
- `trace-stage6.js` (256): exports `createStage6Trace(...)` — hosted-path DNS ask/answer prelude
  (L203-235), NX abort at hop 2, CDN branch handed to `createCdnChain` (`cdn-chain.js`, chunk 2),
  plus `chainStep()` (L119-175) replaying the stage-5 chain. Imported only by `trace.js`.
- `trace-helpers.js` (103): exports `drainUntilYou`, `serveCacheSuffix`, `backendFor`, `serveInto`,
  `finishTo`, `lbEnqueuedFrame`, `lbRefusedFrame`, `workerTailFrame`, `dbHopFrame`. Shared by both
  trace machines (`trace.js:18`, `trace-stage6.js:36-44`).
- `engine-faults.js` (69): exports `createFaultSetters({stage,servers,cache,database,workerQueue,dns})`
  → `setServerDown`, `setCacheBypassed`, `setDatabasePrimaryDown`, `setWorkerCrashed`, `setDnsDropped`,
  each fail-loud below its stage. Imported only by `engine.js`.
- `network.js` (88): exports `createNetwork()` — Map of registered servers, mini-IP validation
  (`MINI_IP`, L17), `send` / `deliverToQueue` refusal choke point with `refusedCount` (L61-86).
  Imported by `engine.js`, `engine-stage6.js`, panel `inspector-source.js`, 5 test files.
- `router.js` (90): exports `createRouter({leftAddress:'10.65', rightAddress:'20.254', leftNetwork,
rightNetwork})` — cross-subnet `forward()`, one hop counted per crossing (`routed`, `lastCross`,
  L67-79), registers an identity seat on the right network (L43-46). Imported by `engine-stage6.js`.
- `browser.js` (89): exports `createBrowser({name, address, network})` — `createRequest`, `parseResponse`,
  `receiveResponse`, `receiveDnsFailure` (NX card), `receiveRefusal` (REFUSED card), `get()`, `last()`.
  Imported by `engine.js`, `users.js`, 5 test files.
- `browser-seat.js` (25): exports `createBrowserSeatRegistry(network)` → idempotent `ensureBrowserSeat`
  registering a left-network answer seat (`Set` of addresses, L13-23). Imported only by `engine.js`.
- `users.js` (64): exports `createUsers({count, serverAddress})` — crowd browsers at `10.(i+2)`,
  `step(rng, arrivalProb)` draws, `receiveResponse` keyed on from-IP host number, `getBrowsers()`.
  Imported only by `engine.js`.
- `rng.js` (12): exports `createRng(seed)` — mulberry32. Imported by `engine.js` and `engine.test.js`.

## Contract touchpoints

- Vitest unit suites in `test/sim/`: `engine.test.js` (seed replay "same seed replays the identical tick
  sequence", `createRng` describe, stage range rejection, DNS/CDN trace shapes, setWebFile routes),
  `network.test.js`, `router.test.js`, `webserver-fault.test.js` ("createNetwork refusal choke point"),
  `loadbalancer.test.js`, `loadbalancer-failover.test.js`, `cache-bypass.test.js`,
  `worker-crash.test.js`, `primary-down.test.js`, `dns-ledger-drop.test.js` (all 12 `test/sim/*.test.js`
  import `createEngine`).
- `slices.yaml` — SIM slice (L23) lists these as backbone unit pins: engine seed replay (L36),
  network slim GET (L38), per-stage engine lines through L119 ("entry_point: n/a (engine logic;
  rendered by PANEL-1)"), router lines L95-98, refusal lines L105-107.
- `storymap.yaml` — SIM stories: "Replay a fixed seed" (L26-32), mini-IP network story (L38-53),
  plus fault stories (stage-2 skip L237+, stage-3/4/5/6 fault toggles) and PANEL stories whose
  e2e assertions read sim-produced trace frames (compare tray, journey log hop ordering).
- Playwright e2e (`e2e/*.spec.js`) drive `traceHop` via the panel: `panel.spec.js` (hop 1/4..4/4 journey),
  `panel-stage6.spec.js` (DNS ask/answer, NX drop), `cdn-edge.spec.js` (6-hop HIT / 9-hop MISS),
  `fault-console*.spec.js` (refused/skip/bypass/primary-down/worker crash/DNS drop narrations).
- Trace narrative sources: `snapshot.lastFrame` (raw frame string minted in the sim) → panel
  (`js/panel/panel.js:90,129,174`, `js/panel/render.js:200`); hop sentences re-derived from
  `snapshot.trace` fields in `js/panel/model.js:37-109` (`hopSentences`); `journey-log.js`/`compare.js`
  consume stored entries verbatim. No download/export feature exists anywhere in the codebase.

## Determinism audit facts

- `grep -rE 'Math\.random|Date\.now|new Date|performance\.now|setTimeout|setInterval' js/sim/` → 2 hits,
  both prose comments, zero code: `rng.js:2` ("`Math.random()` is banned") and `users.js:55`
  ("after `Math.random()`-free construction"). No wall-clock reads, no timers in `js/sim/**`.
- Seed entry: `rng.js` mulberry32 (`a = (a + 0x6d2b79f5)|0`, `Math.imul`), constructed once per engine
  (`engine.js:63`) as `createRng(seed)` with seed coerced by `seed >>> 0` (`rng.js:5`).
- Sole RNG consumer: `userPool.step(rng, arrivalProb)` (`engine.js:176`, `users.js:37`); `users.js`
  holds no randomness of its own; `getBrowsers()` deliberately runs without touching the RNG stream.
- Time advance points: `engine.step()` — `tick += 1` (L167-168), then ordered: `cache.evictExpired(tick)` →
  `database.stepReplication(tick)` → `workerQueue.step(database, tick)` → `userPool.step` arrivals →
  `network.deliverToQueue` with `id: ${tick}:${r.userId}` → `servers.flatMap(s.step(tick))`.
- Trace-time advance: one `bumpTick()` per traced delivery (`engine.js:140-143`) called at the deliver hop
  (`trace.js:115`), LB enqueue hop (`trace.js:152`), and `trace-stage6.js` chain (`L125`); queue-row
  ids in traces are `you:${atTick}`. `traceHop` itself does not bump beyond the deliver/enqueue hops.
- Tick keys: cache/database/dns/cdn TTLs use `getTick/` tick reads (`trace.js:36`, `trace-stage6.js:215`
  `dns.lookup(host, getTick())`).

## Risk hotspots (factual overlaps and boundaries)

- trace.js vs trace-stage6.js overlap: `chainStep` (`trace-stage6.js:119-175`) re-implements the
  stage-5 hop conditions of `trace.js:147-287`. Shared via one implementations: block identical
  pieces (route frame literal `routed ${from} -> ${serverAddress} ... to LoadBalancer` appears at
  `trace.js:149`, `trace-stage6.js:122:239`; `Network delivered ${status} response` at `trace.js:272` /
  `trace-stage6.js:164`; `Browser ${from} received and displayed` at `trace.js:277` /
  `trace-stage6.js:168`; the LB `enqueue({id: you:..., isYou:true})` block at `trace.js:152-160` /
  `trace-stage6.js:125-133`). Difference: `trace.js`'s LB hop handles `target?.refused === true`
  (B-6b abort, `trace.js:164-172`); `chainStep` s5===2 has no refusal branch
  (`trace-stage6.js:124-136`). Two `freshTrace()` field sets exist (`trace.js:64-88`, incl.
  `refused` flag; `trace-stage6.js:92-113`, no `refused`, extra `host/dnsTarget/cdn/edgeStatus/nx`).
- engine.js vs engine-stage6.js overlap: small — `engine-stage6.js` (56 LOC) is pure fabric assembly.
  Duplicated address defaults: `engine.js:50-54` (routerLeftAddress `10.65`, routerRightAddress
  `20.254`, cdnAddress `20.1`) repeat `router.js:20-23` (`10.65`/`20.254`) and stage-6 fabric wiring.
  Duplicated micro-helpers: `MINI_IP` regex in 4 files (`network.js:17`, `router.js:15`, `browser.js:9`
  inline `/^\d+\.\d+$/`, `browser-seat.js:10`); `subnetOf` in 2 files (`router.js:17`,
  `trace-stage6.js:46`).
- Guard proximity: `engine.js` 298 and `trace.js` 294 sit within 2-6 lines of the 300-line production
  guard (`guard-file-size.mjs`); largest file in repo is `webserver.js` 299 (chunk 2).
- Event-ordering touchpoints: (1) traced requests advance the same queues as the crowd —
  `drainUntilYou` (`trace-helpers.js:13-19`) loops `targetServer.step(getTick())` until the `isYou`
  row or an empty batch, so a traceHop can drain servers repeatedly at the harness's current tick;
  (2) restart condition `trace.hop >= finalHop` means a hop-call at the final hop count starts the
  next trace (`trace.js:100`, final hop math L96-98: stage 5→8 … stage 1→4; `trace-stage6.js:183-191`
  NX→2, HIT→6, MISS/non-GET/hosted→9, host-less→8); (3) stage-5 async `served.asyncJob` decides hop
  4/8 vs database-hop narration (`trace.js:241-258`); (4) snapshot aggregates —
  `snapshot.queue`/`snapshot.files` come from `serverSnapshots[0]` only (`engine.js:280-281`) while
  `served`/`refusedCount` etc. are pool-summed.
- Dead/unclear paths (facts only): `trace.js` traces carry a `refused` flag that survives into
  `snapshot.trace` for the stage-1/2 abort shapes; in `trace.js:113-124` the stage-1 deliver hop
  uses `isYou: true` on enqueue though the refusal check is checked before enqueue succeeds.
  `users.js` `receiveResponse` only routes responses whose `from` IP host number ≥ 3 (10.3+;
  `i >= 0` check excludes the learner's 10.2 browser); `engine.js:196` separately routes 10.2 traffic.
- No TODO/FIXME/HACK/XXX anywhere in `js/sim/**`.

## Facts & counts

- LOC: engine.js 298, trace.js 294, trace-stage6.js 256, trace-helpers.js 103, engine-faults.js 69,
  network.js 88, router.js 90, browser.js 89, browser-seat.js 25, users.js 64, rng.js 12
  (`wc -l`, total js/sim = 2998).
- Fan-in: engine.js ← panel.js + 12 v-test files (only production importer of the whole chunk chain
  in `js/` is `panel.js`); network.js ← engine.js + engine-stage6.js + inspector-source.js + 5 test
  files; browser.js ← engine.js + users.js + inspector-source.js + 5 test files; router.js ←
  engine-stage6.js + inspector-source-stage6.js; trace.js/trace-stage6.js/trace-helpers.js ←
  1/1/2 sim importer(s) each; users.js/browser-seat.js/engine-faults.js/rng.js ← engine.js only.
- Fan-out: engine.js imports 11 (+ engine-stage6.js/engine-pool.js beyond this chunk); trace-stage6.js
  imports cdn-chain.js + trace-helpers.js (6 symbols); trace.js imports trace-stage6.js +
  `* as hops` destructure of 3 (L19).
- Keyed structures: network servers `Map` (`network.js:20`), browser seats `Set`
  (`browser-seat.js:13`), users browsers sparse `Array` indexed by user i at `10.(i+2)`
  (`users.js:15-22`), rng closure mutable seed var `a` (`rng.js:5`). Crowd PATHS fixed triple
  `['/', '/about', '/missing']` cycled by `i % 3` (`users.js:8,39`).
- Engine's public surface: `step`, `traceHop`, `setUsers`, `setWebFile`, 5 fault setters (spread),
  `snapshot` (35 top-level fields, incl. `dns`/`router`/`cdn`/`trace` subtrees and 6 fault tallies
  `refusedCount`/`skippedCount`/`bypassedCount`/`failedWrites`/`primaryDown`/`crashed`/`redelivered`).
