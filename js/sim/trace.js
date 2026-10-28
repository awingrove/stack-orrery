// DOCUMENTS: the single-request hop-by-hop state machine behind the panel's
// "Step 1 Hop ->" trace — one hop per call, running across the same
// network/LB/queue/cache machinery the crowd uses (it does not fake a
// shortcut). 4 hops in Stage 1 (emit, route, serve, render); 5 in Stage 2
// (the LB's round-robin pick becomes its own hop); 6 in Stage 3 (the
// backend's cache-aside lookup and the HTTP response emission split in two);
// 7 in Stage 4 (the Database hop after the cache check — WRITE to Primary
// 10.30, fresh/stale SELECT from Replica 10.31, or SKIP on a warm HIT).
//
// The machine owns the trace state and hop transitions; the engine owns the
// clock, the served-exchange record, and browser delivery, handed in as the
// callbacks below. Stage 6 is delegated to its own machine in
// trace-stage6.js (a DNS ask/answer prelude in front of the byte-identical
// stage-5 chain), so the stage-1-to-5 conditions below are untouched.
// B-6 adds the stage-1 refusal branch: with the webserver down the
// transport refuses at the deliver hop and the story ends there — a 2-hop
// aborted narrative built from the refusal record itself.
import { createStage6Trace } from './trace-stage6.js';
import { drainUntilYou, backendFor, serveInto, finishTo } from './trace-helpers.js';

// CHECKS: an out-of-range stage fails loud at construction instead of
// building a trace that can never advance.
export function createTraceMachine({
  stage,
  serverAddress,
  servers,
  lb = null,
  network,
  cache = null,
  database = null,
  workerQueue = null,
  dns = null,
  cdn = null,
  router = null,
  bumpTick,
  getTick,
  onServe,
  onFinish,
  onDnsFail = null,
  onRefusal = null,
}) {
  if (stage !== 1 && stage !== 2 && stage !== 3 && stage !== 4 && stage !== 5 && stage !== 6) {
    throw new Error(`trace: stage must be 1, 2, 3, 4, 5, or 6, got ${stage}`);
  }
  if (stage === 6) {
    return createStage6Trace({
      serverAddress,
      servers,
      lb,
      network,
      dns,
      cdn,
      router,
      cache,
      database,
      workerQueue,
      bumpTick,
      getTick,
      onServe,
      onFinish,
      onDnsFail,
    });
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
      dbOp: null,
      dbStale: false,
      response: null,
      status: null,
      body: null,
      routeId: null,
      refused: false,
    };
  }

  return {
    // One hop per call. Returns the hop's lastFrame string, or null when
    // nothing moved (the engine keeps its previous frame then). The stage-1
    // final hop reads from the live trace shape: a refused delivery ends
    // the story at the deliver hop (2), the served shape walks to 4.
    step({ method = 'GET', path = '/about', from = '10.2' } = {}) {
      const finalStageHop =
        stage === 5 ? 8 : stage === 4 ? 7 : stage === 3 ? 6 : stage === 2 ? 5 : 4;
      const finalHop = stage === 1 && trace.refused ? 2 : finalStageHop;
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
          dbOp: null,
          dbStale: false,
          response: null,
          status: null,
          body: null,
          routeId: null,
          refused: false,
        };
        served = null;
        frame = `${from} -> ${serverAddress} | ${request}`;
      } else if (stage === 1 && trace.hop === 1) {
        trace.hop = 2;
        const atTick = bumpTick();
        const refusal = network.deliverToQueue({
          id: `you:${atTick}`,
          from: trace.from,
          to: serverAddress,
          request: trace.request,
          atTick,
          isYou: true,
        });
        if (refusal?.refused) {
          // CHECKS: B-6 counter-example, DL-3 — the refusal record ABORTS
          // the stage-1 story at the deliver hop: no queue entry (the
          // transport refused before enqueue), no served record, and the
          // response fields stay null so trace.status carries no inherited
          // 200/404 and lastExchange satisfies no mission detector. The
          // frame narrates the refusal itself, not an HTTP
          // status string.
          trace.refused = true;
          onRefusal?.(refusal);
          frame = `${trace.from} -> ${serverAddress} | ${trace.request} => connection refused (nothing enqueued)`;
        } else {
          frame = `routed ${trace.from} -> ${serverAddress} (${trace.request}) into queue`;
        }
      } else if (stage === 1 && trace.hop === 2) {
        trace.hop = 3;
        const you = drainUntilYou(servers[0], getTick);
        if (you) {
          serveInto(trace, you, onServe);
          frame = `${serverAddress} -> ${trace.from} | ${you.response}`;
        }
      } else if (stage === 1 && trace.hop === 3) {
        trace.hop = 4;
        finishTo(trace, serverAddress, onFinish);
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
        const backend = backendFor(servers, trace.targetServer);
        const you = drainUntilYou(backend, getTick);
        if (you) {
          serveInto(trace, you, onServe);
          frame = `${backend.address} -> ${trace.from} | ${you.response}`;
        }
      } else if (stage === 2 && trace.hop === 4) {
        trace.hop = 5;
        finishTo(trace, trace.targetServer ?? serverAddress, onFinish);
      } else if (stage === 3 && trace.hop === 3) {
        // Hop 4/6: the target backend checks Cache and serves the queued
        // request; the response record is held one hop so the learner sees
        // the cache lookup before the response leaves the backend.
        trace.hop = 4;
        const backend = backendFor(servers, trace.targetServer);
        served = drainUntilYou(backend, getTick);
        if (served) {
          trace.cacheStatus = served.cacheStatus ?? null;
          frame = `${backend.address} -> ${cache.address} | cache ${trace.cacheStatus} (${trace.path})`;
        }
      } else if (stage === 3 && trace.hop === 4) {
        trace.hop = 5;
        if (served) {
          serveInto(trace, served, onServe);
          frame = `${trace.targetServer} -> ${trace.from} | ${served.response} (${trace.cacheStatus})`;
        }
      } else if (stage === 3 && trace.hop === 5) {
        trace.hop = 6;
        finishTo(trace, trace.targetServer ?? serverAddress, onFinish);
      } else if (stage === 4 && trace.hop === 3) {
        // Hop 4/7: the target backend checks Cache and serves the queued
        // request (a POST write-through carries cacheStatus INVALIDATE);
        // the response record is held so the learner watches the cache
        // lookup, then the database hop.
        trace.hop = 4;
        const backend = backendFor(servers, trace.targetServer);
        served = drainUntilYou(backend, getTick);
        if (served) {
          trace.cacheStatus = served.cacheStatus ?? null;
          frame = `${backend.address} -> ${cache.address} | cache ${trace.cacheStatus} (${trace.path})`;
        }
      } else if (stage === 4 && trace.hop === 4) {
        // Hop 5/7: the database hop — hop 6's WRITE landed on Primary
        // 10.30 (replication queued toward 10.31), hop 5's SELECT read
        // Replica 10.31 fresh or stale, and a warm cache HIT skips the
        // database entirely.
        trace.hop = 5;
        if (served) {
          trace.dbOp = served.dbOp ?? null;
          trace.dbStale = Boolean(served.dbStale);
          if (trace.dbOp === 'WRITE') {
            frame = `Database WRITE ${trace.path} @ ${database.primaryAddress} (replica ${database.replicaAddress} lags ${database.replicationLagTicks}t)`;
          } else if (trace.dbOp === 'SELECT') {
            frame = `Database SELECT ${trace.path} @ ${database.replicaAddress} (${trace.dbStale ? 'STALE' : 'fresh'})`;
          } else {
            frame = `Database SKIP ${trace.path} (warm cache HIT @ ${cache.address})`;
          }
        }
      } else if (stage === 4 && trace.hop === 5) {
        trace.hop = 6;
        if (served) {
          serveInto(trace, served, onServe);
          frame = `${trace.targetServer} -> ${trace.from} | ${served.response} (cache ${trace.cacheStatus})`;
        }
      } else if (stage === 4 && trace.hop === 6) {
        trace.hop = 7;
        finishTo(trace, trace.targetServer ?? serverAddress, onFinish);
      } else if (stage === 5 && trace.hop === 3) {
        // Hop 4/8: an async POST /jobs enqueues to WorkerQueue 10.40; other
        // requests narrate the cache/database hop they actually took (the
        // Stage 4 story) — no phantom async jobs on GET traces (DL-4).
        trace.hop = 4;
        const backend = backendFor(servers, trace.targetServer);
        served = drainUntilYou(backend, getTick);
        if (served) {
          trace.cacheStatus = served.cacheStatus ?? null;
          trace.dbOp = served.dbOp ?? null;
          trace.dbStale = Boolean(served.dbStale);
          trace.asyncJob = Boolean(served.asyncJob);
          if (served.asyncJob) {
            frame = `${backend.address} -> ${workerQueue ? workerQueue.address : '10.40'} | enqueued async job (${trace.path})`;
          } else if (trace.dbOp === 'WRITE') {
            frame = `Database WRITE ${trace.path} @ ${database.primaryAddress} (replica ${database.replicaAddress} lags ${database.replicationLagTicks}t)`;
          } else if (trace.dbOp === 'SELECT') {
            frame = `Database SELECT ${trace.path} @ ${database.replicaAddress} (${trace.dbStale ? 'STALE' : 'fresh'})`;
          } else {
            frame = `Database SKIP ${trace.path} (warm cache HIT @ ${cache.address})`;
          }
        }
      } else if (stage === 5 && trace.hop === 4) {
        // Hop 5/8: the webserver answers — an immediate 202 for async jobs,
        // the actually-served response for everything else.
        trace.hop = 5;
        if (served) {
          serveInto(trace, served, onServe);
          frame = served.asyncJob
            ? `${trace.targetServer} -> ${trace.from} | ${served.response}`
            : `${trace.targetServer} -> ${trace.from} | ${served.response} (cache ${trace.cacheStatus})`;
        }
      } else if (stage === 5 && trace.hop === 5) {
        // Hop 6/8: WebServer returns its response via Network
        trace.hop = 6;
        frame = `Network delivered ${trace.status} response to ${trace.from}`;
      } else if (stage === 5 && trace.hop === 6) {
        // Hop 7/8: Browser receives and displays the response
        trace.hop = 7;
        finishTo(trace, trace.targetServer ?? serverAddress, onFinish);
        frame = `Browser ${trace.from} received and displayed ${trace.status}`;
      } else if (stage === 5 && trace.hop === 7) {
        // Hop 8/8: async job tails with the worker's commit; a request that
        // was served synchronously finds the worker idle.
        trace.hop = 8;
        const dbTarget = database ? database.primaryAddress : '10.30';
        const workerAddr = workerQueue ? workerQueue.workerAddress : '10.41';
        frame = trace.asyncJob
          ? `Worker ${workerAddr} finished job and committed to Database ${dbTarget}`
          : `Worker ${workerAddr} idle — no async jobs in this trace`;
      }
      return frame;
    },

    snapshot() {
      return { ...trace };
    },
  };
}
