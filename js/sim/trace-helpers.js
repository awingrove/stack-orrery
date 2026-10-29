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
