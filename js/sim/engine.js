// DOCUMENTS: the tick loop — each step() advances exactly one discrete
// tick: users emit request events over the network into the server pool's
// (or load balancer's) queues, the pool consumes up to its per-tick work
// budget and emits response events, then a snapshot is exposed as UI state.
// The newest served exchange is kept in `lastExchange` so the panel can
// show what actually moved on the wire. The interactive single-request
// trace is the hop-by-hop state machine in trace.js, driven one hop per
// traceHop() call across the same network/LB/queue/cache machinery the
// crowd uses — it does not fake a shortcut.
//
// PINS: a fixed seed with a fixed action sequence replays the identical
// tick sequence — pinned by "same seed replays the identical tick sequence"
// in test/sim/engine.test.js.
//
// CHECKS: constructor validates config ranges via its components (seed is
// coerced uint32; arrivalProb must be within [0, 1]; stage must be 1, 2,
// or 3).
import { createRng } from './rng.js';
import { createNetwork } from './network.js';
import { createBrowser } from './browser.js';
import { createWebServer } from './webserver.js';
import { createLoadBalancer } from './loadbalancer.js';
import { createCache } from './cache.js';
import { createUsers } from './users.js';
import { createTraceMachine } from './trace.js';

export function createEngine({
  seed = 42,
  users = 5,
  serviceRate = 4,
  arrivalProb = 0.5,
  serverAddress = '10.1',
  stage = 1,
  backendAddresses = ['10.11', '10.12'],
  ttlTicks = 10,
  cacheAddress = '10.20',
} = {}) {
  if (typeof arrivalProb !== 'number' || arrivalProb < 0 || arrivalProb > 1) {
    throw new Error(`engine: arrivalProb must be within [0, 1], got ${arrivalProb}`);
  }
  if (stage !== 1 && stage !== 2 && stage !== 3) {
    throw new Error(`engine: stage must be 1, 2, or 3, got ${stage}`);
  }
  const rng = createRng(seed);
  const network = createNetwork();
  const cache = stage === 3 ? createCache({ address: cacheAddress, ttlTicks }) : null;
  let servers;
  let lb = null;
  if (stage === 1) {
    const server = createWebServer({ address: serverAddress, serviceRate });
    network.registerServer(serverAddress, server);
    servers = [server];
  } else {
    // Stage 2 wires the LB in front of two duplicated backends; Stage 3
    // attaches the shared cache-aside Cache to both backends, so a fill
    // through one backend serves warm hits through the other.
    servers = backendAddresses.map((addr) =>
      createWebServer({ address: addr, serviceRate, cache }),
    );
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

  // The trace machine owns the hop-by-hop trace state; the engine owns the
  // clock, the served-exchange record, and browser delivery — the machine
  // calls back into these closures as hops execute.
  const traceMachine = createTraceMachine({
    stage,
    serverAddress,
    servers,
    lb,
    network,
    cache,
    bumpTick: () => {
      tick += 1;
      return tick;
    },
    getTick: () => tick,
    onServe: (exchange) => {
      lastExchange = exchange;
      lastMatchedRoute = exchange.routeId;
    },
    onFinish: (record) => {
      userPool.receiveResponse(record);
      if (record.from === '10.2') clientBrowser.receiveResponse(record);
    },
  });

  return {
    step() {
      tick += 1;
      // TTL eviction happens once per tick, before anything is served:
      // expired entries are gone before this tick's work is priced.
      if (cache) cache.evictExpired(tick);
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

    // One hop per call, delegated to the trace machine: 4 hops in Stage 1
    // (emit, route, serve, render); 5 in Stage 2 (LB round-robin between
    // route and serve); 6 in Stage 3 (cache check, then response emit).
    // `from` is the mini-IP of the browser the trace originates from
    // (default the learner's own 10.2).
    traceHop({ method = 'GET', path = '/about', from = '10.2' } = {}) {
      const frame = traceMachine.step({ method, path, from });
      if (frame !== null) lastFrame = frame;
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
        cache: cache ? cache.snapshot(tick) : null,
        lastMatchedRoute,
        lastFrame,
        browserDisplay: clientBrowser.last(),
        browsers: userPool.getBrowsers(),
        trace: traceMachine.snapshot(),
      };
    },
  };
}
