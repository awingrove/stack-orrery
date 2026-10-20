// DOCUMENTS: the tick loop — each step() advances exactly one discrete
// tick: users emit request events over the network into the server's (or
// load balancer's) queue, the server pool consumes up to its service rate
// and emits response events, then a snapshot is exposed as UI state. The
// newest served exchange is kept in `lastExchange` so the panel can show
// what actually moved on the wire. `traceHop()` runs the interactive
// single-request trace for the learner's own browser, one hop per call,
// across the same network/LB/queue machinery the crowd uses — it does not
// fake a shortcut.
//
// PINS: a fixed seed with a fixed action sequence replays the identical
// tick sequence — pinned by "same seed replays the identical tick sequence"
// in test/sim/engine.test.js.
//
// CHECKS: constructor validates config ranges via its components (seed is
// coerced uint32; arrivalProb must be within [0, 1]; stage must be 1 or 2).
import { createRng } from './rng.js';
import { createNetwork } from './network.js';
import { createBrowser } from './browser.js';
import { createWebServer } from './webserver.js';
import { createLoadBalancer } from './loadbalancer.js';
import { createUsers } from './users.js';

export function createEngine({
  seed = 42,
  users = 5,
  serviceRate = 4,
  arrivalProb = 0.5,
  serverAddress = '10.1',
  stage = 1,
  backendAddresses = ['10.11', '10.12'],
} = {}) {
  if (typeof arrivalProb !== 'number' || arrivalProb < 0 || arrivalProb > 1) {
    throw new Error(`engine: arrivalProb must be within [0, 1], got ${arrivalProb}`);
  }
  if (stage !== 1 && stage !== 2) {
    throw new Error(`engine: stage must be 1 or 2, got ${stage}`);
  }
  const rng = createRng(seed);
  const network = createNetwork();
  let servers;
  let lb = null;
  if (stage === 1) {
    const server = createWebServer({ address: serverAddress, serviceRate });
    network.registerServer(serverAddress, server);
    servers = [server];
  } else {
    servers = backendAddresses.map((addr) => createWebServer({ address: addr, serviceRate }));
    for (const s of servers) network.registerServer(s.address, s);
    lb = createLoadBalancer({ address: serverAddress, backends: backendAddresses, network });
    network.registerServer(serverAddress, lb);
  }
  // The learner's own interactive client shares the crowd's network and
  // server pool but keeps its own browser and address; users.js keeps its
  // addresses so seeded tick sequences stay identical (PINS above).
  const clientBrowser = createBrowser({ name: 'Browser (You)', address: '10.2', network });
  const userPool = createUsers({ count: users, serverAddress });
  let tick = 0;
  let lastExchange = null;
  let lastMatchedRoute = null;
  let lastFrame = null;
  let trace = {
    hop: 0,
    method: 'GET',
    path: '/about',
    from: '10.2',
    request: 'GET /about',
    targetServer: null,
    response: null,
    status: null,
    body: null,
    routeId: null,
  };

  function drainUntilYou(targetServer) {
    for (;;) {
      const batch = targetServer.step(tick);
      const you = batch.find((item) => item.isYou);
      if (you || batch.length === 0) return you;
    }
  }

  function recordTraceServe(you, fromAddr) {
    if (!you) return;
    trace.response = you.response;
    trace.status = you.status;
    trace.body = you.body;
    trace.routeId = you.routeId;
    lastExchange = you;
    lastMatchedRoute = you.routeId;
    lastFrame = `${fromAddr} -> ${trace.from} | ${you.response}`;
  }

  // Final trace hop: the rendered response lands on the browser the trace
  // originated from. The learner's own browser (10.2) keeps its dedicated
  // clientBrowser; pool browsers receive theirs via userPool.receiveResponse.
  function finishTrace(toAddress) {
    const record = {
      from: trace.from ?? '10.2',
      to: toAddress,
      request: trace.request,
      response: trace.response,
    };
    userPool.receiveResponse(record);
    if (record.from === '10.2') clientBrowser.receiveResponse(record);
  }

  return {
    step() {
      tick += 1;
      const arrivals = userPool.step(rng, arrivalProb);
      for (const r of arrivals) {
        network.deliverToQueue({
          id: `${tick}:${r.userId}`,
          from: r.from,
          to: r.to,
          request: r.request,
          atTick: tick,
        });
      }
      const servedBatch = servers.flatMap((s) => s.step(tick));
      if (servedBatch.length > 0) {
        lastExchange = servedBatch[servedBatch.length - 1];
        lastMatchedRoute = lastExchange.routeId;
        lastFrame = `${lastExchange.from} -> ${lastExchange.to} | ${lastExchange.request} => ${lastExchange.response}`;
        for (const item of servedBatch) {
          // Every served exchange is delivered back to its originating
          // browser; the learner's own interactive client additionally
          // renders anything it originated (trace items or 10.2 crowd rays).
          userPool.receiveResponse(item);
          if (item.isYou || item.from === '10.2') clientBrowser.receiveResponse(item);
        }
      }
      return this.snapshot();
    },

    // One hop per call: 4 hops in Stage 1 (emit, route, serve, render);
    // 5 hops in Stage 2 (emit, route to LB, LB round-robin to backend,
    // backend serve, render). `from` is the mini-IP of the browser the
    // trace originates from (default the learner's own 10.2).
    traceHop({ method = 'GET', path = '/about', from = '10.2' } = {}) {
      const finalHop = stage === 2 ? 5 : 4;
      if (trace.hop === 0 || trace.hop >= finalHop) {
        const request = `${method} ${path}`;
        trace = {
          hop: 1,
          method,
          path,
          from,
          request,
          targetServer: stage === 1 ? serverAddress : null,
          response: null,
          status: null,
          body: null,
          routeId: null,
        };
        lastFrame = `${from} -> ${serverAddress} | ${request}`;
      } else if (stage === 1 && trace.hop === 1) {
        trace.hop = 2;
        tick += 1;
        network.deliverToQueue({
          id: `you:${tick}`,
          from: trace.from,
          to: serverAddress,
          request: trace.request,
          atTick: tick,
          isYou: true,
        });
        lastFrame = `routed ${trace.from} -> ${serverAddress} (${trace.request}) into queue`;
      } else if (stage === 1 && trace.hop === 2) {
        trace.hop = 3;
        recordTraceServe(drainUntilYou(servers[0]), serverAddress);
      } else if (stage === 1 && trace.hop === 3) {
        trace.hop = 4;
        finishTrace(serverAddress);
      } else if (stage === 2 && trace.hop === 1) {
        trace.hop = 2;
        lastFrame = `routed ${trace.from} -> ${serverAddress} (${trace.request}) to LoadBalancer`;
      } else if (stage === 2 && trace.hop === 2) {
        trace.hop = 3;
        tick += 1;
        const target = lb.enqueue({
          id: `you:${tick}`,
          from: trace.from,
          to: serverAddress,
          request: trace.request,
          atTick: tick,
          isYou: true,
        });
        trace.targetServer = target;
        lastFrame = `LB ${serverAddress} -> ${target} (${trace.request}) queued`;
      } else if (stage === 2 && trace.hop === 3) {
        trace.hop = 4;
        const backend = servers.find((s) => s.address === trace.targetServer) ?? servers[0];
        recordTraceServe(drainUntilYou(backend), backend.address);
      } else if (stage === 2 && trace.hop === 4) {
        trace.hop = 5;
        finishTrace(trace.targetServer ?? serverAddress);
      }
      return this.snapshot();
    },

    setUsers(n) {
      userPool.setCount(n);
    },

    snapshot() {
      const serverSnapshots = servers.map((s) => ({
        address: s.address,
        ...s.metrics(),
        queue: s.queueSnapshot(),
        files: s.filesSnapshot(),
      }));
      const queueDepth = serverSnapshots.reduce((sum, s) => sum + s.queueDepth, 0);
      const served = serverSnapshots.reduce((sum, s) => sum + s.served, 0);
      const active = serverSnapshots.filter((s) => s.served > 0);
      const avgLatencyTicks =
        active.length === 0
          ? 0
          : active.reduce((sum, s) => sum + s.avgLatencyTicks, 0) / active.length;
      return {
        stage,
        tick,
        users: userPool.getCount(),
        serverAddress,
        queueDepth,
        served,
        avgLatencyTicks,
        lastExchange,
        queue: serverSnapshots[0].queue,
        files: serverSnapshots[0].files,
        servers: serverSnapshots,
        loadBalancer: lb ? lb.snapshot() : null,
        lastMatchedRoute,
        lastFrame,
        browserDisplay: clientBrowser.last(),
        browsers: userPool.getBrowsers(),
        trace: { ...trace },
      };
    },
  };
}
