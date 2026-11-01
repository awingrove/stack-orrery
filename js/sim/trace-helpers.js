// DOCUMENTS: hop helpers shared by the two trace-state machines (trace.js
// and trace-stage6.js) — the queue drain, the backend pick, the serve
// record hand-off, and the final delivery call. Extracted by
// responsibility (guard-file-size): both machines run these identical hop
// semantics, so the one implementation lives here and each hop site passes
// its live trace in. Hop texts stay at the machines' own branch sites; the
// B-6b LB-hop frames mint here from the LB's live selection record, and the
// R1a shared `lbEnqueueHop` (below) runs the branch for both machines.

// Serve from the front of the target's queue until the trace's own
// request (isYou) comes back, or the queue runs dry this tick.
export function drainUntilYou(targetServer, getTick) {
  for (;;) {
    const batch = targetServer.step(getTick());
    const you = batch.find((item) => item.isYou);
    if (you || batch.length === 0) return you;
  }
}

// The served-response hop's cache suffix: every real cache consult names
// its outcome, but the B-6d WRITE_DOWN record consulted nothing, so no
// "(cache …)" claim rides that frame — a raw "cache null" would narrate
// the record's absence as if null were a cache state.
export function serveCacheSuffix(trace) {
  return trace.dbOp === 'WRITE_DOWN' ? '' : ` (cache ${trace.cacheStatus})`;
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

// DOCUMENTS: the shared LB hop itself (R1a brief, docs/plans/2026-11-01-r1a-stage6-lb-hop-unification.md) — the branch
// text that lived in trace.js's stage-5 hop now runs for BOTH machines:
// trace.js's stage-5 branch and trace-stage6.js's chainStep(2) call this
// one, so an all-down pool, a one-down pool, and a healthy pool tell the
// identical story from stage 2 through stage 6 (the finding 1-01 defect —
// the stage-6 chain re-implementation narrating the refusal record as
// `[object Object]` and walking a phantom chain — cannot reappear).
//
// CHECKS: the frame reads the LB's own selection state, branch by branch —
//   all-down → `lb.enqueue` returns the slice-1 refusal record, the trace
//   stamps `refused: true`, `onRefusal` fires so the browser gets its
//   connection-refused card, and the frame is the refusal card
//   ("LB 10.1 -> 10.11 | GET /about => connection refused (nothing
//   enqueued)") with `targetServer` untouched;
//   one-down → the health-aware cursor's skip is narrated in the frame
//   ("LB 10.1 -> 10.12 (GET /about) queued — 10.11 is down — skipped") with
//   `targetServer := target` and `refused` left as the trace already holds;
//   both-up → the plain byte shape ("LB 10.1 -> 10.11 (GET /about) queued").
export function lbEnqueueHop(trace, { serverAddress, lb, bumpTick, onRefusal }) {
  const atTick = bumpTick();
  const target = lb.enqueue({
    id: `you:${atTick}`,
    from: trace.from,
    to: serverAddress,
    request: trace.request,
    atTick,
    isYou: true,
  });
  if (target?.refused === true) {
    trace.refused = true;
    onRefusal?.(target);
    return { frame: lbRefusedFrame(serverAddress, target, trace.request), refused: true };
  }
  const skippedAt = lb.lastSkip?.();
  trace.targetServer = target;
  return {
    frame: lbEnqueuedFrame(serverAddress, target, trace.request, skippedAt),
    refused: false,
  };
}

// CHECKS: B-6e — the stage-5 worker-tail frame (hop 8/8), minted from the
// live queue record: an async trace tails with the worker's commit, a
// synchronous trace finds the worker idle. While the worker is crashed the
// async tail reads the QUEUE's own state — the waiting count is the queue's
// live backlog — so a crashing trace stamps no phantom "finished job"
// commit and the 202 enqueue frames stay byte-identical; the synchronous
// tail keeps its byte shape (the crash does not touch the story that never
// consulted the worker). One implementation shared by trace.js and
// trace-stage6.js's chain.
export function workerTailFrame(trace, workerQueue, database) {
  const dbTarget = database ? database.primaryAddress : '10.30';
  const workerAddr = workerQueue ? workerQueue.workerAddress : '10.41';
  if (trace.asyncJob && workerQueue?.isCrashed?.() === true) {
    const waiting = workerQueue.pendingCount?.() ?? 0;
    return `Worker ${workerAddr} crashed — ${waiting} job(s) waiting in the queue (nothing committed)`;
  }
  return trace.asyncJob
    ? `Worker ${workerAddr} finished job and committed to Database ${dbTarget}`
    : `Worker ${workerAddr} idle — no async jobs in this trace`;
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
