// DOCUMENTS: the engine snapshot's record assembly — moved verbatim out of
// engine.js's snapshot() in R2e (file-size headroom at the engine cap; the
// returned record's keys and values are the contract). The deps are the
// engine's live state, passed explicitly at each snapshot() call; the module
// imports buildRegistry itself (R2d read-side seam), so engine.js does not
// pass the registry.
//
// PINS: the record's key set and order are contract-stable — pinned by
// "the engine snapshot's key set is contract-stable across the
// engine-snapshot assembly extraction — no shape evolved in this slice"
// in test/sim/pool-truth.test.js; the record itself keeps riding the
// existing engine.test pins, pool-truth pins, and the panel consumers.
import { buildRegistry } from './registry.js';

export function buildEngineSnapshot({
  stage,
  tick,
  servers,
  lb,
  cache,
  database,
  workerQueue,
  dns,
  router,
  edge,
  network,
  userPool,
  traceMachine,
  serverAddress,
  lastExchange,
  lastMatchedRoute,
  lastFrame,
  clientBrowser,
}) {
  const serverSnapshots = servers.map((s) => ({
    address: s.address,
    ...s.metrics(),
    down: s.isDown(),
    queue: s.queueSnapshot(),
    files: s.filesSnapshot(),
  }));
  const queueDepth = serverSnapshots.reduce((sum, s) => sum + s.queueDepth, 0);
  const served = serverSnapshots.reduce((sum, s) => sum + s.served, 0);
  const active = serverSnapshots.filter((s) => s.served > 0);
  const avgLatencyTicks =
    active.length === 0 ? 0 : active.reduce((sum, s) => sum + s.avgLatencyTicks, 0) / active.length;
  return {
    stage,
    registry: buildRegistry(stage),
    tick,
    users: userPool.getCount(),
    serverAddress,
    queueDepth,
    served,
    avgLatencyTicks,
    refusedCount: network.refusedCount(),
    // B-6b: the failover skip tally rides the snapshot (stage-2 mission + loads).
    skippedCount: lb?.skippedCount() ?? 0,
    // B-6c: the pool's own origin-path tally (the cache is not consulted while bypassed, so it cannot tally there).
    bypassedCount: servers.reduce((sum, s) => sum + (s.bypassedCount?.() ?? 0), 0),
    // B-6d: pool-summed refused writes (each webserver tallies its own
    // share; the database's own failedWrites only moves on a direct
    // write() call, e.g. the Stage 5 worker commit) and the primary's
    // live ON/OFF flag read back from the component itself.
    failedWrites: servers.reduce((sum, s) => sum + (s.failedWrites?.() ?? 0), 0),
    primaryDown: database?.isPrimaryDown?.() ?? false,
    // B-6e: the worker's crash flag and re-delivery tally read back from
    // the queue component itself.
    crashed: workerQueue?.isCrashed?.() ?? false,
    redelivered: workerQueue?.redelivered?.() ?? 0,
    lastExchange,
    // CHECKS: top-level shape = the pool's primary backend (10.1 alone on stage 1, 10.11 from stage 2 on) — per-server shapes live on snapshot.servers[i]; a merged aggregate is rejected (fs-editor already routes per-server); lineage: full-review finding 1-06, Stage R2c option (b).
    primaryQueue: serverSnapshots[0].queue,
    primaryFiles: serverSnapshots[0].files,
    servers: serverSnapshots,
    loadBalancer: lb ? lb.snapshot() : null,
    cache: cache ? cache.snapshot(tick) : null,
    database: database ? database.snapshot(tick) : null,
    workerQueue: workerQueue ? workerQueue.snapshot(tick) : null,
    dns: dns ? dns.snapshot(tick) : null,
    router: router ? router.snapshot() : null,
    cdn: edge ? edge.snapshot(tick) : null,
    lastMatchedRoute,
    lastFrame,
    browserDisplay: clientBrowser.last(),
    browsers: userPool.getBrowsers(),
    trace: traceMachine.snapshot(),
  };
}
