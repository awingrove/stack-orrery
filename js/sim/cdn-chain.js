// DOCUMENTS: the Stage 6b CDN trace chain — delegated to from
// trace-stage6.js by responsibility (guard-file-size): the stage-6 machine
// stays the DNS/ask-answer prelude plus the byte-identical stage-5 chain,
// and this module owns the chain whose DNS answer lives in the edge's
// subnet. The engine hands in the real components (cdn.js edge, router.js,
// loadbalancer, backend servers) with itself as no shortcut: hop 3 and hop
// 5/8 are real `router.forward` crossings (`routed` +1 per crossing), the
// MISS pull's left-network delivery IS the real `lb.enqueue`, hop 7 really
// drains the origin backend so its cache-aside status rides the frame, and
// hop 8 fills the edge ledger only with the bytes that pull really
// returned. HIT = 6 hops, MISS and non-GET pass-through = 9.
//
// CHECKS: (negative cases pinned in test/sim/cdn.test.js and
// test/sim/engine.test.js) a miss or expired entry answers only from a
// fresh pull — the ledger answers nothing outside its tick window — and a
// non-GET leaves the ledger untouched (no lookup, no counters, no row; the
// machine's hop 4 marks PASS and the fill branch only runs on a MISS); a
// GET inside the edge TTL is served from ledger bytes `fill` recorded
// earlier — nothing fabricated.
export function createCdnChain({
  cdn,
  router,
  lb,
  servers,
  bumpTick,
  getTick,
  onServe,
  onFinish,
  getTrace,
}) {
  if (!cdn || !router || !lb) {
    throw new Error('cdn-chain: cdn, router, and lb are required');
  }

  // The machine's live trace object (recreated per hop-1 emission); this
  // chain reads and writes it in place, one hop per call.
  const trace = () => getTrace();

  function drainUntilYou(targetServer) {
    for (;;) {
      const batch = targetServer.step(getTick());
      const you = batch.find((item) => item.isYou);
      if (you || batch.length === 0) return you;
    }
  }

  function backendFor(targetAddress) {
    return servers.find((s) => s.address === targetAddress) ?? servers[0];
  }

  function serve(you) {
    const t = trace();
    t.response = you.response;
    t.status = you.status;
    t.body = you.body;
    t.routeId = you.routeId;
    t.cacheStatus = you.cacheStatus ?? null;
    t.dbOp = you.dbOp ?? null;
    t.dbStale = Boolean(you.dbStale);
    t.asyncJob = Boolean(you.asyncJob);
    onServe(you);
  }

  function finish(toAddress) {
    const t = trace();
    onFinish({
      from: t.from ?? '10.2',
      to: toAddress,
      request: t.request,
      response: t.response,
    });
  }

  // The response crosses BACK through the Router into the originating
  // browser's left-network seat (`routed` +1, each direction counts). The
  // frame's wire token is the slim response record ("<status> <body>") —
  // one token per frame on this wire, whatever kind crosses it; the browser
  // seat acknowledges the frame and the render hop performs the real
  // onFinish delivery.
  function deliverResponse(note = '') {
    const t = trace();
    router.forward({
      id: `edge-resp:${getTick()}`,
      from: cdn.address,
      to: t.from,
      request: t.response,
      atTick: getTick(),
      isYou: true,
    });
    return `${router.address} -> ${t.from} | ${t.response} delivered${note}`;
  }

  // One hop per call; `hop` mirrors the stage-6 machine's is a real step
  // number (3-9) and the trace advances exactly one hop per call either
  // way. Frames consume the components' actual messages — the Router's
  // crossings, the ledger rows, the LB's real pick, the drained origin
  // record — per the cdn.js and router.js contracts.
  function step(hop) {
    const t = trace();
    t.hop = hop;
    if (hop === 3) {
      // One explicit tick per trace run (the stage-5 chain bumps at its
      // enqueue hop — same determinism contract, one bump per run).
      bumpTick();
      router.forward({
        id: `you:${getTick()}`,
        from: t.from,
        to: cdn.address,
        request: t.request,
        atTick: getTick(),
        isYou: true,
      });
      return `${t.from} -> ${router.address} | ${t.request} (to ${cdn.address})`;
    }
    if (hop === 4) {
      if (t.method !== 'GET') {
        // GET-only edge: a non-GET leaves the ledger untouched (the pull
        // still goes to the origin — the MISS shape minus the fill).
        t.edgeStatus = 'PASS';
        return `${cdn.address} -> ${router.address} | PASS — ${t.method} ${t.path} is not edge-cacheable, pulling origin ${cdn.originAddress} via router`;
      }
      const result = cdn.lookup(t.path, getTick());
      t.edgeStatus = result.status;
      if (result.status === 'MISS') {
        return `${cdn.address} -> ${router.address} | MISS — pulling origin ${cdn.originAddress} via router`;
      }
      // HIT: the ledger row's own bytes (filled by an earlier real pull)
      // are what leaves the edge — ttl is the row's remaining ticks.
      const entry = cdn.snapshot(getTick()).ledger.find((row) => row.path === t.path);
      t.response = `200 ${entry.body}`;
      t.status = 200;
      t.body = entry.body;
      t.routeId = t.path === '/' ? 'route-home' : `route-${t.path.slice(1)}`;
      serve({
        id: `edge:${getTick()}`,
        from: cdn.address,
        to: t.from,
        request: t.request,
        isYou: true,
        response: t.response,
        status: t.status,
        body: t.body,
        routeId: t.routeId,
        cacheStatus: 'HIT',
      });
      return `${cdn.address} -> ${router.address} | ${t.response} (edge HIT, ttl ${entry.ttlRemaining}t)`;
    }
    if (hop === 5) {
      if (t.edgeStatus === 'HIT') {
        return deliverResponse();
      }
      // The edge really pulls the origin through the Router: the crossing
      // is `routed` +1 and the delivered frame IS the real lb.enqueue — the
      // narrated queueing is the round-robin pick that really happened.
      router.forward({
        id: `edge-pull:${getTick()}`,
        from: cdn.address,
        to: cdn.originAddress,
        request: t.request,
        atTick: getTick(),
        isYou: true,
      });
      t.targetServer = lb.snapshot().lastTarget;
      return `${cdn.address} -> ${cdn.originAddress} | ${t.request} (edge pull via router)`;
    }
    if (hop === 6) {
      if (t.edgeStatus === 'HIT') {
        finish(cdn.address);
        return `Browser ${t.from} received and displayed ${t.status}`;
      }
      return `LB ${cdn.originAddress} -> ${t.targetServer} (${t.request}) queued`;
    }
    if (hop === 7) {
      const backend = backendFor(t.targetServer);
      const served = drainUntilYou(backend);
      if (!served) return null;
      serve(served);
      return `${backend.address} -> ${router.address} | ${served.response} (cache ${served.cacheStatus})`;
    }
    if (hop === 8) {
      if (t.edgeStatus === 'MISS') {
        // The pulled origin bytes are exactly what enters the ledger — the
        // fill is the chain's only ledger write, after a real pull.
        cdn.fill(t.path, t.body, getTick());
        return deliverResponse(` (edge FILL ${t.path}, ttl ${cdn.ttlTicks}t)`);
      }
      return deliverResponse(' (no edge FILL — non-GET pass-through)');
    }
    if (hop === 9) {
      finish(t.targetServer ?? cdn.originAddress);
      return `Browser ${t.from} received and displayed ${t.status}`;
    }
    return null;
  }

  return { step };
}
