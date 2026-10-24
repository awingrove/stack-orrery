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
import { createStage6Trace } from './trace-stage6.js';

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
  bumpTick,
  getTick,
  onServe,
  onFinish,
  onDnsFail = null,
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
      const finalHop = stage === 5 ? 8 : stage === 4 ? 7 : stage === 3 ? 6 : stage === 2 ? 5 : 4;
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
      } else if (stage === 4 && trace.hop === 3) {
        // Hop 4/7: the target backend checks Cache and serves the queued
        // request (a POST write-through carries cacheStatus INVALIDATE);
        // the response record is held so the learner watches the cache
        // lookup, then the database hop.
        trace.hop = 4;
        const backend = backendFor(trace.targetServer);
        served = drainUntilYou(backend);
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
          serve(served);
          frame = `${trace.targetServer} -> ${trace.from} | ${served.response} (cache ${trace.cacheStatus})`;
        }
      } else if (stage === 4 && trace.hop === 6) {
        trace.hop = 7;
        finish(trace.targetServer ?? serverAddress);
      } else if (stage === 5 && trace.hop === 3) {
        // Hop 4/8: an async POST /jobs enqueues to WorkerQueue 10.40; other
        // requests narrate the cache/database hop they actually took (the
        // Stage 4 story) — no phantom async jobs on GET traces (DL-4).
        trace.hop = 4;
        const backend = backendFor(trace.targetServer);
        served = drainUntilYou(backend);
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
          serve(served);
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
        finish(trace.targetServer ?? serverAddress);
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
