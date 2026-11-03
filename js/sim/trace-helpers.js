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

// The nominal final hop of each stage's served trace shape (trace.js's and
// trace-stage6.js's existing ladders, and model.js/panel.js's old
// TOTAL_HOPS tables, unified into ONE count surface).
const NOMINAL = { 1: 4, 2: 5, 3: 6, 4: 7, 5: 8, 6: 9 };

// CHECKS: the ONE final-hop count surface (R2a, finding 3-05) — the two
// trace machines terminate their walks against it (trace.js's
// `hop >= finalHop` exit and trace-stage6.js's emission reset, both below)
// and the panel resolves denominators from it (model.js's describeSnapshot
// totalHops and hopSentences totals, panel.js's journey labels + per-hop
// breaks). Pure read over (stage, trace): no state, no randomness. A
// refusal is its own shape, NOT a renumber of the served ladder — stage 1
// aborts at the deliver hop (2), stages 2-5 abort at the LB hop (3), and
// the served ladder's hops 4+ stay off the refused run (DL-3
// counter-example, pinned in test/panel/model.test.js,
// test/panel/model-stage34.test.js and test/panel/model-stage5.test.js).
// Stage 6 splits on the live trace shape exactly as the R1a walk burned
// them in: NX -> 2, CDN edge HIT -> 6, CDN MISS/pass-through -> 9, hosted
// subnet-10 -> 9, host-less -> 8. A refusal is NOT one number either —
// the card lands where each shape's own LB hop sits (the reopened probe
// walks, docs/plans/2026-11-02-r2a-finalhop-seam.md): host-less 3 (emit,
// routed, card), hosted 4 (the DNS ask/answer prelude + routed hop precede
// the card), cdn 6 (the pull chain runs to the LB hop before the card). A
// null trace reads nominal, and an unknown stage falls back to 4
// (trace.js's existing default).
export function finalHop(stage, trace = null) {
  if (stage === 6) {
    if (!trace) return NOMINAL[6];
    if (trace.refused) return trace.cdn ? 6 : trace.host ? 4 : 3;
    if (trace.nx) return 2;
    if (trace.cdn) return trace.edgeStatus === 'HIT' ? 6 : 9;
    return trace.host ? 9 : 8;
  }
  return trace?.refused ? (stage === 1 ? 2 : 3) : (NOMINAL[stage] ?? 4);
}

// CHECKS: R3b, finding 5-02 — TRACE_VOCAB is the one vocabulary seam
// between the machines and the teaching drawer — the drawer never
// re-authors sim vocabulary; it interpolates these tokens where it quotes
// sim output, so a machine reword reds the round-trip pin
// (test/panel/teaching-vocab.test.js) until this export is fixed, and the
// bound drawer follows that fix. Every value composes to the exact bytes
// its minting site emits today.
//
// Minting sites (token -> file:line where the machine mints the literal):
//   requestToken   js/sim/trace.js:103 (`${method} ${path}`), emit frame :114
//   nextChipPrefix js/panel/model.js:232 (`Next -> ${nextBackend}`, fallback :233)
//   staleTag       js/panel/model-dbop.js:20 (`STALE (lag ${lag}t)`; lag home js/sim/defaults.js:15)
//   refusedCard    js/sim/trace.js:135 (stage-1 deliver frame) / this file :61 (lbRefusedFrame)
//   skipSuffix     js/sim/trace-helpers.js:56 (lbEnqueuedFrame skip narration)
//   routedToken    js/panel/model.js:267 (`Routed: ${router.routed}`)
//   idleWorker     js/sim/trace-helpers.js:123 (workerTailFrame sync tail; mirror js/panel/model-stage5-chain.js:68)
//   nxCard         js/sim/trace-stage6.js:236 (NX answer frame) / js/sim/browser.js:51 (NX card record)
//   dnsAsk         js/sim/trace-stage6.js:223 (`who is ${host}?`)
//   accepted202    js/sim/webserver.js:79 (`202 {"jobId": …, "status": "queued"}`)
//   workerCommit   js/panel/model-stage5-chain.js:47 (async hop-8/8 sentence)
export const TRACE_VOCAB = Object.freeze({
  requestToken: (method = 'GET', path = '/about') => `${method} ${path}`,
  nextChipPrefix: 'Next ->',
  staleTag: (lag) => `STALE (lag ${lag}t)`,
  refusedCard: 'connection refused (nothing enqueued)',
  skipSuffix: (seat) => `— ${seat} is down — skipped`,
  routedToken: 'Routed:',
  idleWorker: 'idle — no async jobs in this trace',
  nxCard: 'NX no record',
  dnsAsk: (host) => `who is ${host}?`,
  accepted202: (jobId) => `202 {"jobId": ${jobId}, "status": "queued"}`,
  workerCommit: (worker, database) =>
    `Worker (${worker}) processed job and committed to Database (${database})`,
});
