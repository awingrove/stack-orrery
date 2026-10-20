// DOCUMENTS: the single-request hop-by-hop state machine behind the panel's
// "Step 1 Hop ->" trace — one hop per call, running across the same
// network/LB/queue/cache machinery the crowd uses (it does not fake a
// shortcut). 4 hops in Stage 1 (emit, route, serve, render); 5 in Stage 2
// (the LB's round-robin pick becomes its own hop); 6 in Stage 3 (the
// backend's cache-aside lookup and the HTTP response emission split into
// two hops so the learner can watch Cache 10.20 answer, then the backend
// emit).
//
// The machine owns the trace state and hop transitions; the engine owns
// the clock, the served-exchange record, and browser delivery, handed in
// as the four callbacks below.
//
// CHECKS: an out-of-range stage fails loud at construction instead of
// building a trace that can never advance.
export function createTraceMachine({
  stage,
  serverAddress,
  servers,
  lb = null,
  network,
  cache = null,
  bumpTick,
  getTick,
  onServe,
  onFinish,
}) {
  if (stage !== 1 && stage !== 2 && stage !== 3) {
    throw new Error(`trace: stage must be 1, 2, or 3, got ${stage}`);
  }
  let trace = freshTrace();
  let served = null; // the drained response record, held between hops 4/6 and 5/6

  function freshTrace() {
    return {
      hop: 0,
      method: 'GET',
      path: '/about',
      from: '10.2',
      request: 'GET /about',
      targetServer: null,
      cacheStatus: null,
      response: null,
      status: null,
      body: null,
      routeId: null,
    };
  }

  // Serve from the front of the target's queue until the trace's own
  // request (isYou) comes back, or the queue runs dry this tick.
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
    trace.response = you.response;
    trace.status = you.status;
    trace.body = you.body;
    trace.routeId = you.routeId;
    onServe(you);
  }

  // Final hop: the rendered response lands on the browser the trace
  // originated from (the engine routes it into the right browser state).
  function finish(toAddress) {
    onFinish({
      from: trace.from ?? '10.2',
      to: toAddress,
      request: trace.request,
      response: trace.response,
    });
  }

  return {
    // One hop per call. Returns the hop's lastFrame string, or null when
    // nothing moved (the engine keeps its previous frame then).
    step({ method = 'GET', path = '/about', from = '10.2' } = {}) {
      const finalHop = stage === 3 ? 6 : stage === 2 ? 5 : 4;
      let frame = null;
      if (trace.hop === 0 || trace.hop >= finalHop) {
        const request = `${method} ${path}`;
        trace = {
          hop: 1,
          method,
          path,
          from,
          request,
          targetServer: stage === 1 ? serverAddress : null,
          cacheStatus: null,
          response: null,
          status: null,
          body: null,
          routeId: null,
        };
        served = null;
        frame = `${from} -> ${serverAddress} | ${request}`;
      } else if (stage === 1 && trace.hop === 1) {
        trace.hop = 2;
        const atTick = bumpTick();
        network.deliverToQueue({
          id: `you:${atTick}`,
          from: trace.from,
          to: serverAddress,
          request: trace.request,
          atTick,
          isYou: true,
        });
        frame = `routed ${trace.from} -> ${serverAddress} (${trace.request}) into queue`;
      } else if (stage === 1 && trace.hop === 2) {
        trace.hop = 3;
        const you = drainUntilYou(servers[0]);
        if (you) {
          serve(you);
          frame = `${serverAddress} -> ${trace.from} | ${you.response}`;
        }
      } else if (stage === 1 && trace.hop === 3) {
        trace.hop = 4;
        finish(serverAddress);
      } else if (trace.hop === 1) {
        trace.hop = 2;
        frame = `routed ${trace.from} -> ${serverAddress} (${trace.request}) to LoadBalancer`;
      } else if (trace.hop === 2) {
        trace.hop = 3;
        const atTick = bumpTick();
        const target = lb.enqueue({
          id: `you:${atTick}`,
          from: trace.from,
          to: serverAddress,
          request: trace.request,
          atTick,
          isYou: true,
        });
        trace.targetServer = target;
        frame = `LB ${serverAddress} -> ${target} (${trace.request}) queued`;
      } else if (stage === 2 && trace.hop === 3) {
        trace.hop = 4;
        const backend = backendFor(trace.targetServer);
        const you = drainUntilYou(backend);
        if (you) {
          serve(you);
          frame = `${backend.address} -> ${trace.from} | ${you.response}`;
        }
      } else if (stage === 2 && trace.hop === 4) {
        trace.hop = 5;
        finish(trace.targetServer ?? serverAddress);
      } else if (stage === 3 && trace.hop === 3) {
        // Hop 4/6: the target backend checks Cache and serves the queued
        // request; the response record is held one hop so the learner sees
        // the cache lookup before the response leaves the backend.
        trace.hop = 4;
        const backend = backendFor(trace.targetServer);
        served = drainUntilYou(backend);
        if (served) {
          trace.cacheStatus = served.cacheStatus ?? null;
          frame = `${backend.address} -> ${cache.address} | cache ${trace.cacheStatus} (${trace.path})`;
        }
      } else if (stage === 3 && trace.hop === 4) {
        trace.hop = 5;
        if (served) {
          serve(served);
          frame = `${trace.targetServer} -> ${trace.from} | ${served.response} (${trace.cacheStatus})`;
        }
      } else if (stage === 3 && trace.hop === 5) {
        trace.hop = 6;
        finish(trace.targetServer ?? serverAddress);
      }
      return frame;
    },

    snapshot() {
      return { ...trace };
    },
  };
}
