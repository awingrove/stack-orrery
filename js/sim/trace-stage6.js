// DOCUMENTS: the Stage 6 trace machine — a DNS ask/answer prelude in front
// of the unchanged Stage 5 chain, plus the Stage 6b CDN branch keyed on the
// answer's subnet. Split from trace.js by responsibility (guard-file-size):
// trace.js stays the stages 1-5 machine verbatim and hands stage 6 to this
// module. Shared engine properties (clock callbacks, serve/finish routing)
// arrive in the constructor, so no shortcut is faked — the ask hop really
// runs the DNS ledger lookup, and the CDN hops really run the Router, the
// edge ledger, and the LB/backend pull.
//
// Hosted browser paths (<host>/<path>) split on the first slash: hop 1 is
// the ask to DNS 10.60, hop 2 is the ledger answer. A resolved target
// re-points the GET at the plain path, and a non-CDN (subnet-10) answer
// replays the Stage 5 chain byte-identically at hops 3-9 (s5 = hop - 1,
// minus the stage-5 emit hop so the wire frames stay real). Host-less paths
// (/<path>) run the Stage 5 shape exactly: 8 hops, same frames, no DNS
// consult. An NX answer renders the NX card on the browser and NO GET is
// emitted: the trace ends at hop 2 (CHECKS: pinned in
// test/sim/engine.test.js — a following traceHop restarts a fresh trace,
// it cannot walk a phantom hop 3).
//
// Stage 6b CDN branch (js/sim/cdn.js contract): when the DNS answer's
// subnet matches the edge's, the browser's GET rides the real Router into
// subnet 20 — hop 3 is a real `router.forward` crossing (`routed` +1); the
// wire token after the answer is the resolved mini-IP, not the hostname
// (the DL-4 rule holds here too). A GET inside the edge TTL is served from
// the fill ledger in 6 hops (edge HIT with the ledger's own bytes, the
// response's reverse crossing — `routed` +1 — then the render); a MISS
// pulls the origin through the Router in the 9-hop shape (real Router pull
// whose left-network delivery is the LB queueing it narrates, a real
// `drainUntilYou` so the origin's cache-aside status rides the frame, then
// the real `fill` + the reverse crossing + the render). A non-GET does
// not touch the edge ledger: it rides the MISS shape minus the fill (named
// counter-example pinned: edge counters stay at their initial values, the
// ledger row stays absent).
import { createCdnChain } from './cdn-chain.js';
import {
  drainUntilYou,
  backendFor,
  serveInto,
  finishTo,
  dbHopFrame,
  serveCacheSuffix,
} from './trace-helpers.js';

const subnetOf = (address) => String(address).split('.')[0];

export function createStage6Trace({
  serverAddress,
  servers,
  lb,
  dns,
  cdn = null,
  router = null,
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
  if (!cdn) {
    throw new Error('trace: stage 6 requires the CDN edge component');
  }
  if (!router) {
    throw new Error('trace: stage 6 requires the Router component');
  }

  let trace = freshTrace(); // the live machine state, recreated per emission
  let served = null; // drained response held between the cache/db and serve hops
  let answer = null; // the DNS ledger result, held from the ask to the answer hop

  // The CDN hops live in their own module (guard-file-size split); it reads
  // and writes this machine's live trace object in place via getTrace.
  const cdnChain = createCdnChain({
    cdn,
    router,
    lb,
    servers,
    bumpTick,
    getTick,
    onServe,
    onFinish,
    getTrace: () => trace,
  });

  function freshTrace() {
    return {
      hop: 0,
      method: 'GET',
      path: '/about',
      host: null,
      dnsTarget: null,
      cdn: false,
      edgeStatus: null,
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

  // The Stage 5 chain, one stage-hop per call: s5 is the machine state the
  // original stage-5 conditions ran on, and the trace advances one hop per
  // call either way. Frames are assembled from the same trace fields, so
  // host-less output is identical to the stage-5 machine's.
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
      const backend = backendFor(servers, trace.targetServer);
      served = drainUntilYou(backend, getTick);
      if (served) {
        trace.cacheStatus = served.cacheStatus ?? null;
        trace.dbOp = served.dbOp ?? null;
        trace.dbStale = Boolean(served.dbStale);
        trace.asyncJob = Boolean(served.asyncJob);
        if (served.asyncJob) {
          return `${backend.address} -> ${workerQueue?.address ?? '10.40'} | enqueued async job (${trace.path})`;
        }
        // The B-6d WRITE_DOWN branch mints its refusal frame here too — the
        // byte shape is one implementation (trace-helpers.js dbHopFrame).
        return dbHopFrame(trace, database, cache);
      }
      return null;
    }
    if (s5 === 4) {
      if (served) {
        serveInto(trace, served, onServe);
        return served.asyncJob
          ? `${trace.targetServer} -> ${trace.from} | ${served.response}`
          : `${trace.targetServer} -> ${trace.from} | ${served.response}${serveCacheSuffix(trace)}`;
      }
      return null;
    }
    if (s5 === 5) {
      return `Network delivered ${trace.status} response to ${trace.from}`;
    }
    if (s5 === 6) {
      finishTo(trace, trace.targetServer ?? serverAddress, onFinish);
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
      // Final hop count comes from the live trace shape: 2 once the answer
      // says NX, 6 for a CDN GET served from the edge ledger (HIT), 9 for a
      // CDN MISS or non-GET pass-through, 9 for other hosted paths, 8
      // host-less.
      const finalHop = trace.nx
        ? 2
        : trace.cdn
          ? trace.edgeStatus === 'HIT'
            ? 6
            : 9
          : trace.host
            ? 9
            : 8;
      let frame;
      if (trace.hop === 0 || trace.hop >= finalHop) {
        // Emission parses the typed path into host + resource path on the
        // first slash — 'example.com/about' is hosted; '/about' is not —
        // but is itself NO wire hop on a hosted path. CHECKS: the browser's
        // first wire frame is the DNS ask; the GET only becomes a wire
        // token after the answer re-points it at the resolved target, so a
        // listed hop must never show a wire arrow toward a hostname (the
        // old "10.2 -> example.com | GET ..." narrated a delivery the
        // component model never makes — DL-4; for an NX host no GET exists
        // at all). Host-less emission keeps the stage-5 emit frame verbatim.
        const slash = String(path).indexOf('/');
        const host =
          slash === -1 ? String(path) : slash === 0 ? null : String(path).slice(0, slash);
        const rest = slash === -1 ? '/' : String(path).slice(slash);
        const request = `${method} ${path}`;
        trace = { ...freshTrace(), hop: 1, method, path: rest, host: host || null, request, from };
        served = null;
        answer = null;
        if (host) {
          // Hop 1 of the hosted shape is the ask: the DNS ledger lookup
          // runs right here, feeding the answer hop the component's real
          // result.
          answer = dns.lookup(host, getTick());
          frame = `${from} -> ${dns.address} | who is ${host}?`;
        } else {
          frame = `${from} -> ${serverAddress} | ${request}`;
        }
      } else if (trace.hop === 1 && trace.host) {
        // Hop 2: the ledger answer. NX ends the trace here; a resolved
        // target re-points the GET at the plain resource path. A subnet-20
        // answer (the edge owns 20.1) hands the GET to the CDN branch —
        // its own hop shape, still hostname-free on the wire.
        trace.hop = 2;
        if (answer.status === 'NX') {
          trace.nx = true;
          onDnsFail({ from: trace.from, request: trace.request });
          frame = `${dns.address} -> ${trace.from} | NX no record`;
        } else {
          trace.dnsTarget = answer.target;
          trace.request = `${trace.method} ${trace.path}`;
          trace.cdn = subnetOf(answer.target) === subnetOf(cdn.address);
          frame = `${dns.address} -> ${trace.from} | ${answer.target}`;
        }
      } else if (trace.hop === 1) {
        // Host-less hop 2/8 keeps the stage-5 route wording byte-identical.
        trace.hop = 2;
        frame = `routed ${trace.from} -> ${serverAddress} (${trace.request}) to LoadBalancer`;
      } else if (trace.cdn) {
        // The CDN chain numbers its hops in wire order: hop 3 is the first
        // hop after the ask/answer prelude, so the machine's live hop (2
        // after the answer) advances by one before the chain's branch runs.
        frame = cdnChain.step(trace.hop + 1);
      } else {
        const s5 = trace.host ? trace.hop - 1 : trace.hop;
        frame = chainStep(s5);
      }
      return frame;
    },

    snapshot() {
      return { ...trace };
    },
  };
}
