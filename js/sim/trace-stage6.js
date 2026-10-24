// DOCUMENTS: the Stage 6 trace machine — a DNS ask/answer prelude in front
// of the unchanged Stage 5 chain. It is split from trace.js by
// responsibility (guard-file-size): trace.js stays the stages 1-5 machine
// verbatim and hands stage 6 to this module. Shared engine properties
// (clock callbacks, serve/finish routing) arrive in the constructor, so no
// shortcut is faked — the ask hop really runs the DNS ledger lookup and the
// serve hop really drains the target's queue.
//
// Hosted browser paths (<host>/<path>) split on the first slash: hop 1
// emits the typed request, hop 2 is the ask to DNS 10.60, hop 3 is the
// answer — a resolved target re-points the GET at the plain path and the
// Stage 5 chain replays byte-identically at hops 4-10 (+2 hop numbers).
// Host-less paths (/<path>) run the Stage 5 shape exactly: 8 hops, same
// frames, no DNS consult. An NX answer renders the NX card on the browser
// and NO GET is emitted: the trace ends at hop 3 (CHECKS: pinned in
// test/sim/engine.test.js — a following traceHop restarts a fresh trace,
// it cannot walk a phantom hop 4).
export function createStage6Trace({
  serverAddress,
  servers,
  lb,
  dns,
  cache = null,
  database = null,
  workerQueue = null,
  bumpTick,
  getTick,
  onServe,
  onFinish,
  onDnsFail,
}) {
  if (!dns) {
    throw new Error('trace: stage 6 requires a DNS component');
  }

  let trace = freshTrace();
  let served = null; // drained response held between the cache/db and serve hops
  let answer = null; // the DNS ledger result, held from the ask to the answer hop

  function freshTrace() {
    return {
      hop: 0,
      method: 'GET',
      path: '/about',
      host: null,
      dnsTarget: null,
      nx: false,
      request: 'GET /about',
      targetServer: null,
      cacheStatus: null,
      dbOp: null,
      dbStale: false,
      asyncJob: false,
      response: null,
      status: null,
      body: null,
      routeId: null,
    };
  }

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

  function finish(toAddress) {
    onFinish({
      from: trace.from ?? '10.2',
      to: toAddress,
      request: trace.request,
      response: trace.response,
    });
  }

  // The Stage 5 chain, one stage-hop per call: s5 is the machine state the
  // original stage-5 conditions ran on, and the trace advances one hop per
  // call either way — hosted at hop s5+2, host-less at hop s5. Frames are
  // assembled from the same trace fields, so host-less output is identical
  // to the stage-5 machine's.
  function chainStep(s5) {
    trace.hop += 1;
    if (s5 === 1) {
      return `routed ${trace.from} -> ${serverAddress} (${trace.request}) to LoadBalancer`;
    }
    if (s5 === 2) {
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
      return `LB ${serverAddress} -> ${target} (${trace.request}) queued`;
    }
    if (s5 === 3) {
      const backend = backendFor(trace.targetServer);
      served = drainUntilYou(backend);
      if (served) {
        trace.cacheStatus = served.cacheStatus ?? null;
        trace.dbOp = served.dbOp ?? null;
        trace.dbStale = Boolean(served.dbStale);
        trace.asyncJob = Boolean(served.asyncJob);
        if (served.asyncJob) {
          return `${backend.address} -> ${workerQueue?.address ?? '10.40'} | enqueued async job (${trace.path})`;
        }
        if (trace.dbOp === 'WRITE') {
          return `Database WRITE ${trace.path} @ ${database.primaryAddress} (replica ${database.replicaAddress} lags ${database.replicationLagTicks}t)`;
        }
        if (trace.dbOp === 'SELECT') {
          return `Database SELECT ${trace.path} @ ${database.replicaAddress} (${trace.dbStale ? 'STALE' : 'fresh'})`;
        }
        return `Database SKIP ${trace.path} (warm cache HIT @ ${cache.address})`;
      }
      return null;
    }
    if (s5 === 4) {
      if (served) {
        serve(served);
        return served.asyncJob
          ? `${trace.targetServer} -> ${trace.from} | ${served.response}`
          : `${trace.targetServer} -> ${trace.from} | ${served.response} (cache ${trace.cacheStatus})`;
      }
      return null;
    }
    if (s5 === 5) {
      return `Network delivered ${trace.status} response to ${trace.from}`;
    }
    if (s5 === 6) {
      finish(trace.targetServer ?? serverAddress);
      return `Browser ${trace.from} received and displayed ${trace.status}`;
    }
    if (s5 === 7) {
      const dbTarget = database ? database.primaryAddress : '10.30';
      const workerAddr = workerQueue ? workerQueue.workerAddress : '10.41';
      return trace.asyncJob
        ? `Worker ${workerAddr} finished job and committed to Database ${dbTarget}`
        : `Worker ${workerAddr} idle — no async jobs in this trace`;
    }
    return null;
  }

  return {
    step({ method = 'GET', path = '/about', from = '10.2' } = {}) {
      // Final hop count comes from the live trace shape: 8 for host-less,
      // 10 for hosted, and 3 once the answer says NX.
      const finalHop = trace.host ? (trace.nx ? 3 : 10) : 8;
      let frame;
      if (trace.hop === 0 || trace.hop >= finalHop) {
        // Emission: the typed path splits into host + resource path on the
        // first slash. 'example.com/about' is hosted; '/about' is not.
        const slash = String(path).indexOf('/');
        const host =
          slash === -1 ? String(path) : slash === 0 ? null : String(path).slice(0, slash);
        const rest = slash === -1 ? '/' : String(path).slice(slash);
        const request = `${method} ${path}`;
        trace = { ...freshTrace(), hop: 1, method, path: rest, host: host || null, request, from };
        served = null;
        answer = null;
        frame = host
          ? `${from} -> ${host} | ${request}`
          : `${from} -> ${serverAddress} | ${request}`;
      } else if (trace.hop === 1 && trace.host) {
        // Hop 2/10: the browser asks DNS — the ledger lookup runs right
        // here, feeding the answer hop the component's real result.
        trace.hop = 2;
        answer = dns.lookup(trace.host, getTick());
        frame = `${trace.from} -> ${dns.address} | who is ${trace.host}?`;
      } else if (trace.hop === 1) {
        // Host-less hop 2/8 keeps the stage-5 route wording byte-identical.
        trace.hop = 2;
        frame = `routed ${trace.from} -> ${serverAddress} (${trace.request}) to LoadBalancer`;
      } else if (trace.hop === 2 && trace.host) {
        // Hop 3/10: the ledger answer. NX ends the trace here; a resolved
        // target re-points the GET at the plain resource path, so the
        // remaining chain traffic reads exactly like stage 5's.
        trace.hop = 3;
        if (answer.status === 'NX') {
          trace.nx = true;
          onDnsFail({ from: trace.from, request: trace.request });
          frame = `${dns.address} -> ${trace.from} | NX no record`;
        } else {
          trace.dnsTarget = answer.target;
          trace.request = `${trace.method} ${trace.path}`;
          frame = `${dns.address} -> ${trace.from} | ${answer.target}`;
        }
      } else {
        const s5 = trace.host ? trace.hop - 2 : trace.hop;
        frame = chainStep(s5);
      }
      return frame;
    },

    snapshot() {
      return { ...trace };
    },
  };
}
