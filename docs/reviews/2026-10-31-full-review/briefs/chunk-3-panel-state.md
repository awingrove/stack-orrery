# Chunk 3 — Panel state — Context Brief

## Layer map

- `model.js` (250 LOC) is the hub: pure label/geometry view-model. Imports `model-stage6.js`,
  `model-stage5-chain.js`, `model-dbop.js`; no DOM, no imports from `js/sim`.
- `model-stage6.js` (82) imports `withHopPrefix` from `model.js` (circular `model.js` ⇄
  `model-stage6.js` edge) and `stage5ChainParts` from `model-stage5-chain.js`.
- `model-stage5-chain.js` (69) imports `dbOpSentence` from `model-dbop.js`.
- `model-dbop.js` (24) leaf: one sentence function, no imports.
- `stage6-registry.js` (128), `url-state.js` (29), `inspector-state.js` (235) are separate
  leaves, all imported by `panel.js` / `render.js`.
- Consumer list: `render.js` (`describeSnapshot`, `componentTitle`, `formatComponentState`),
  `compare.js` (`alignCompareRows`, `nextCompareSlots`), `journey-log.js` (`orderJourneyEntries`),
  `panel.js` (`TICK_MS`, `ensureStage6Dom`, `readDeepLink`, `syncUrlState`),
  `model-stage6.js` (`withHopPrefix`). `missions.js`, `fault-console.js`, `fs-editor.js`
  bypass this chunk and read the raw snapshot directly.

## Per-file inventory

- `model.js` — `TICK_MS`, `withHopPrefix`, `journeyEntryIsBefore`, `orderJourneyEntries`,
  `alignCompareRows`, `nextCompareSlots`, `describeSnapshot`; maps a snapshot to view labels +
  hop sentences; imported by render.js, compare.js, journey-log.js, panel.js, model-stage6.js,
  4 test files.
- `model-stage5-chain.js` — `stage5ChainParts(snapshot, from, serverAddress)`: 8 bare Stage-5
  sentences (async `/jobs` vs synchronous, incl. crashed-worker branch L26); consumed by
  `model.js` (stage 5) and `model-stage6.js`.
- `model-stage6.js` — `stage6Sentences(snapshot, from, serverAddress)`: DNS/CDN/NX prelude +
  renumbered stage-5 tail; consumed by `model.js` L40, pinned by model-stage6.test.js.
- `model-dbop.js` — `dbOpSentence(dbOp, {stale, primary, replica, lag, cacheAddress})`:
  WRITE_DOWN / WRITE / SELECT fresh|STALE / SKIP; consumers `model.js` L60,
  `model-stage5-chain.js` L52.
- `stage6-registry.js` — `ensureStage6Dom()`: one-shot DOM injection of DNS/Router/CDN node
  cards, 3 wire columns, 3 `comp-tab` buttons (idempotent via module-scope `injected` L14-18);
  consumed by `panel.js:23`, lazy id lookups in `render.js:105`, `render-stage.js:12`.
- `url-state.js` — `readDeepLink()` (`?stage=N&users=U`, clamped 1-6 / 1-50, fallbacks stage 1 /
  5 users) and `syncUrlState()` (`history.replaceState`, existing params preserved); consumed
  only by `panel.js` (L18, 112, 143, 268).
- `inspector-state.js` — `formatComponentState`, `componentTitle`, and `STATE_BUILDERS` with one
  builder per component (`browser`, `network`, `loadbalancer`, `webserver`, `cache`, `database`,
  `workerqueue`, `dns`, `router`, `cdn`), JSON.stringify'd for `#inspector-state`; consumed by
  `render.js:7` and 4 test files.

## Sim-mirroring facts

- Source snapshot: `js/sim/engine.js:241-296` `snapshot()` composes
  `loadBalancer.snapshot()`, `cache.snapshot(tick)`, `database.snapshot(tick)`,
  `workerQueue.snapshot(tick)`, `dns.snapshot(tick)`, `router.snapshot()`, `cdn.snapshot(tick)`,
  `traceMachine.snapshot()`, `userPool.getBrowsers()`. Component snapshots are the real
  component state: `js/sim/cache.js:119-125` maps its live `entries` Map (key, value,
  cachedAtTick, expiresAtTick, ttlRemaining); `js/sim/queue.js:160-161` copies `pendingJobs` /
  `activeJob`. So `model.js`/`inspector-state.js` read sim-produced records — the mirror is
  derived, not probabilistic.
- Hand-rebuilt section: `inspector-state.js:79-141` — the `network.interfaces` map is a
  per-stage literal table authored in the panel (unquoted/quoted key mix for `10.20` etc.),
  not read back from `js/sim/network.js` registration.
- Panel-authored constants inside builders: `serviceRatePerTick: 4`
  (`inspector-state.js:156`), `algorithm: 'round-robin'` (`:146`), `strategy: 'cache-aside'`
  (`:175`), `strategy: 'pull-through, GET-only'` (`:227`), `role: 'authoritative name server'`
  (`:208`).
- Duplicated sim defaults (panel fallback `??` vs sim default arg): TTL 10 → `model.js:203,231`,
  `inspector-state.js:176,229` vs `js/sim/cache.js:18` `ttlTicks = 10`; DNS TTL 300 →
  `model.js:222`, `inspector-state.js:209`, `stage6-registry.js:34,105` vs
  `js/sim/dns.js:29` `ttlTicks = 300`; replication lag 3 → `model.js:65`,
  `model-stage5-chain.js:56`, `inspector-state.js:189` vs `js/sim/database.js:27`
  `replicationLagTicks = 3`. 37 mini-IP literals (`10.20`, `10.30`, …) in `inspector-state.js`.
- Hop-count table duplicated: `model.js:15` `TOTAL_HOPS = { 1: 4, 2: 5, 3: 6, 4: 7, 5: 8, 6: 9 }`
  mirrors the trace machines' shapes (`js/sim/trace.js:4` comment; `js/sim/trace-stage6.js:13-26`),
  agreed only by comment, not derived.
- Hop sentence interpolations (`t.request`, `t.response`, `t.cacheStatus`, `t.dbOp`,
  `t.edgeStatus`, `filledAt.ttlRemaining`) come from `snapshot.trace` records; the sentence
  templates themselves are panel-authored per stage and nurated to mirror `trace.js` /
  `trace-stage6.js` frames without copying their strings.
- `stage6-registry.js` `FIRST_TEXT` (L104-108) duplicates the zero-state stat strings that
  `model.js:203,220-222,229-231` builds from the same default counters.

## stage6-registry.js facts

- Registers: `node-router` (`router-stats`), `node-dns` (`dns-stats`, `dns-entries-list`),
  `node-cdn` (`cdn-stats`, `cdn-entries-list`), wire columns `wire-router`/`wire-dns`/`wire-cdn`
  (lanes `packet-req-*` / `packet-res-*`), plus 3 `comp-tab` buttons appended to `.comp-tabs`.
- Runs once at panel boot (`panel.js:23` calls it before render loops; `injected` guard).
- `model.js`/`inspector-state.js` do not reference it; the linkage is DOM ids + the
  `dataset.testid = id` / `dataset.component = component` attributes (L65-66) that `render.js`
  lazy-grabs (`render.js:105` "JS-injected by stage6-registry.js, so their lookups stay lazy";
  `render-stage.js:12` same note).
- Confirmatory comments: "Router chip and stats line read 10.65 ⇄ 20.254 — the edge took 20.1,
  matching router.js's re-seat exactly" (L11-12).

## URL-state & inspector-state facts

- `url-state.js`: `readDeepLink()` reads exactly once (`panel.js:268` → boot); stage range 1-6,
  users 1-50 clamped; invalid falls back without console error; `syncUrlState` rewrites via
  `history.replaceState` on stage-pill clicks (`panel.js:112`) and slider commits
  (`panel.js:143`), preserving other params.
- `inspector-state.js` shape: per-component plain objects of counters + live entry arrays
  (`cacheEntries → snapshot.cache?.entries ?? []` L182, `dns ledger → snapshot.dns?.cache`
  L214, `cdn ledger → snapshot.cdn?.ledger` L233, `db rows` L194, `pendingJobs` L203), then
  JSON.stringify 2-space. `componentTitle` derives every mini-IP from the live snapshot with
  static fallbacks (documented counter-example at L11-16: stage-1 webserver reads `10.1`, not
  the static `10.11 / 10.12`). Browser slot falls back to `snapshot.browserDisplay` only for
  the `10.2` browser (L70-71). Throws `Error` on unknown component (L7, L55).

## Contract touchpoints

- `test/panel/model.test.js` (296) — `describe('describeSnapshot')`: core labels, throughput
  0.00/t at tick 0, journey run ordering, webserver headline derive-from-snapshot pins.
- `test/panel/model-stage34.test.js` (232) — Stage 3 6-hop / Stage 4 7-hop trace labels + cache
  and database inspector state.
- `test/panel/model-stage5.test.js` (197) — Stage 5 8-hop async trace labels + workerqueue
  inspector state.
- `test/panel/model-stage6.test.js` (316) — hosted 9-hop, host-less byte-identical counter-example,
  NX 2-hop end, CDN 6/9-hop HIT/MISS/PASS shapes, cdn inspector state + headline.
- `test/panel/model-compare.test.js` (180) — em-dash alignment, byte-verbatim passthrough,
  slot A/B shift rules, tick-run rejection, hop-key alignment.
- `test/panel/render.test.js` (56) — `journeyEntryIsBefore` / `orderJourneyEntries` ordering for
  the renderer.
- `slices.yaml` L154-180, 213-221 and `storymap.yaml` L68 pin these exact test names.
- data-tested ids this chunk produces: `node-router`, `node-dns`, `node-cdn`, `dns-stats`,
  `dns-entries-list`, `router-stats`, `cdn-stats`, `cdn-entries-list`, `packet-*` lanes
  (`stage6-registry.js`); all other testids resolve from `panel.html`.

## Risk hotspots

- Stage addenda duplication: three `dbOpSentence` call sites (`model.js:60`, `model-stage5-chain.js:52`)
  each rebuilding the same fallback option object `{stale: t.dbStale, primary '10.30', replica
'10.31', lag 3, cacheAddress '10.20'}` per stage; the stage-6 hosted shape renumbers
  `parts.slice(1)` (L81) — hop numbering coupled to the slice index.
- Small-file sprawl: `model-dbop.js` at 24 lines, `url-state.js` at 29 — both
  guard-file-size extractions with precedent comments ("the model-stage6.js precedent").
- `model.js` export fan-out: 7 exports, 6 different importers, plus the circular
  `model-stage6.js → model.js` (`withHopPrefix`) edge.
- `inspector-state.js` network interfaces: 5 nested per-stage ternaries with repeated literal
  maps (L79-141) — every new component adds both a builder and entries across stages.
- Zero-weight defaults duplicated across 3+ panel files vs sim constructor defaults (see
  Sim-mirroring facts), drift risk if a stage rebalances TTL/lag.
- No `TODO`/`FIXME` markers in `js/panel/**` (grep: 0 hits).
