// DOCUMENTS: hop helpers shared by the two trace-state machines (trace.js
// and trace-stage6.js) — the queue drain, the backend pick, the serve
// record hand-off, and the final delivery call. Extracted by
// responsibility (guard-file-size): both machines run these identical hop
// semantics, so the one implementation lives here and each hop site passes
// its live trace in. Hop texts stay at the machines' own branch sites; the
// only frame minted here is the B-6b LB-hop pair, which the stage-2 branch
// shapes from the LB's live selection record (the branch's CHECKS comment
// in trace.js carries the claim for this pair).

// Serve from the front of the target's queue until the trace's own
// request (isYou) comes back, or the queue runs dry this tick.
export function drainUntilYou(targetServer, getTick) {
  for (;;) {
    const batch = targetServer.step(getTick());
    const you = batch.find((item) => item.isYou);
    if (you || batch.length === 0) return you;
  }
}

export function backendFor(servers, targetAddress) {
  return servers.find((s) => s.address === targetAddress) ?? servers[0];
}

export function serveInto(trace, you, onServe) {
  trace.response = you.response;
  trace.status = you.status;
  trace.body = you.body;
  trace.routeId = you.routeId;
  onServe(you);
}

// Final hop: the rendered response lands on the browser the trace
// originated from (the engine routes it into the right browser state).
export function finishTo(trace, toAddress, onFinish) {
  onFinish({
    from: trace.from ?? '10.2',
    to: toAddress,
    request: trace.request,
    response: trace.response,
  });
}

// B-6b LB-hop frames, built from the LB's own selection state: an enqueued
// pick names the seat the cursor crossed (no skip keeps the byte shape),
// an all-down pool narrates the refusal record it received.
export function lbEnqueuedFrame(serverAddress, target, request, skippedAt) {
  return skippedAt
    ? `LB ${serverAddress} -> ${target} (${request}) queued — ${skippedAt} is down — skipped`
    : `LB ${serverAddress} -> ${target} (${request}) queued`;
}

export function lbRefusedFrame(serverAddress, record, request) {
  return `LB ${serverAddress} -> ${record.to} | ${request} => connection refused (nothing enqueued)`;
}

// The Stage 4+ database-hop frame, minted from the served record's own dbOp
// (the trace machine assigns trace.dbOp from it first): WRITE to the
// primary, the B-6d WRITE_DOWN refusal while the primary is down, a
// fresh/stale SELECT from the replica, or the warm-cache SKIP. One
// implementation shared by trace.js (stages 4 and 5) and trace-stage6.js's
// chain so the byte shape cannot drift between the machines.
export function dbHopFrame(trace, database, cache) {
  if (trace.dbOp === 'WRITE_DOWN') {
    return `Database WRITE FAILED (${trace.path}) @ ${database.primaryAddress} — primary down, nothing written`;
  }
  if (trace.dbOp === 'WRITE') {
    return `Database WRITE ${trace.path} @ ${database.primaryAddress} (replica ${database.replicaAddress} lags ${database.replicationLagTicks}t)`;
  }
  if (trace.dbOp === 'SELECT') {
    return `Database SELECT ${trace.path} @ ${database.replicaAddress} (${trace.dbStale ? 'STALE' : 'fresh'})`;
  }
  return `Database SKIP ${trace.path} (warm cache HIT @ ${cache.address})`;
}
