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
// coerced uint32; arrivalProb must be within [0, 1]; stage must be within
// 1-6). Stage 6 instantiates DNS 10.60, the cross-subnet Router (10.65 ⇄
// 20.254 — Stage 6b re-seat; the edge owns 20.1) and the CDN edge on the
// right network at 20.1; hosted paths add the DNS ask/answer hops and CDN
// ones ride the Router + edge.
import { createRng } from './rng.js';
import { createNetwork } from './network.js';
import { createBrowser } from './browser.js';
import { createWebServer } from './webserver.js';
import { createLoadBalancer } from './loadbalancer.js';
import { createCache } from './cache.js';
import { createDatabase } from './database.js';
import { createWorkerQueue } from './queue.js';
import { createDns } from './dns.js';
import { createRouter } from './router.js';
import { createCdnEdge } from './cdn.js';
import { createBrowserSeatRegistry } from './browser-seat.js';
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
  replicationLagTicks = 3,
  dbPrimaryAddress = '10.30',
  dbReplicaAddress = '10.31',
  workerQueueAddress = '10.40',
  workerAddress = '10.41',
  jobDurationTicks = 2,
  dnsAddress = '10.60',
  dnsTtlTicks = 300,
  routerLeftAddress = '10.65',
  // Stage 6b: the CDN edge took 10.65's old 20-side seat (20.1), so the
  // router re-seats to 20.254 and the edge registers at 20.1.
  routerRightAddress = '20.254',
  cdnAddress = '20.1',
  edgeTtlTicks = 10,
} = {}) {
  if (typeof arrivalProb !== 'number' || arrivalProb < 0 || arrivalProb > 1) {
    throw new Error(`engine: arrivalProb must be within [0, 1], got ${arrivalProb}`);
  }
  if (stage !== 1 && stage !== 2 && stage !== 3 && stage !== 4 && stage !== 5 && stage !== 6) {
    throw new Error(`engine: stage must be 1, 2, 3, 4, 5, or 6, got ${stage}`);
  }
  const rng = createRng(seed);
  const network = createNetwork();
  const cache = stage >= 3 ? createCache({ address: cacheAddress, ttlTicks }) : null;
  const database =
    stage >= 4
      ? createDatabase({
          primaryAddress: dbPrimaryAddress,
          replicaAddress: dbReplicaAddress,
          replicationLagTicks,
        })
      : null;
  const workerQueue =
    stage >= 5
      ? createWorkerQueue({
          address: workerQueueAddress,
          workerAddress,
          jobDurationTicks,
        })
      : null;
  // Stage 6: the authoritative DNS (10.60, tick-TTL ledger) and the
  // cross-subnet Router that joins the flat 10.x registry with a 20.x one
  // (from Stage 6b the router sits 10.65 ⇄ 20.254; the edge owns 20.1).
  const dns = stage >= 6 ? createDns({ address: dnsAddress, ttlTicks: dnsTtlTicks }) : null;
  const rightNetwork = stage >= 6 ? createNetwork() : null;
  const router =
    stage >= 6
      ? createRouter({
          leftAddress: routerLeftAddress,
          rightAddress: routerRightAddress,
          leftNetwork: network,
          rightNetwork,
        })
      : null;
  let servers;
  let lb = null;
  if (stage === 1) {
    const server = createWebServer({ address: serverAddress, serviceRate });
    network.registerServer(serverAddress, server);
    servers = [server];
  } else {
    // Stage 2 wires the LB in front of two duplicated backends; Stage 3
    // attaches the shared cache-aside Cache to both backends; Stage 4 adds
    // the primary/replica Database; Stage 5 adds the WorkerQueue & Worker.
    servers = backendAddresses.map((addr) =>
      createWebServer({ address: addr, serviceRate, cache, database, workerQueue }),
    );
    for (const s of servers) network.registerServer(s.address, s);
    lb = createLoadBalancer({ address: serverAddress, backends: backendAddresses, network });
    network.registerServer(serverAddress, lb);
  }
  // CHECKS (Stage 6b): the CDN edge instantiates on the right network at
  // `cdnAddress` (default 20.1) next to the router's re-seated right-side
  // seat. The edge's seat receives the frames the Router delivers into
  // subnet 20 (the same seat pattern the router itself uses); the real
  // ledger decision runs through edge.lookup inside the trace machine.
  const edge =
    stage >= 6
      ? createCdnEdge({
          address: cdnAddress,
          ttlTicks: edgeTtlTicks,
          originAddress: serverAddress,
        })
      : null;
  if (edge) {
    rightNetwork.registerServer(cdnAddress, {
      handleRequest: () => `200 CDN edge ${cdnAddress}`,
      enqueue: (frame) => frame,
    });
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

  // CHECKS (Stage 6b): left-network wire seats for browsers receiving
  // cross-subnet response frames (browser-seat.js); registered before a
  // trace runs.
  const ensureBrowserSeat = createBrowserSeatRegistry(network);

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
    database,
    workerQueue,
    dns,
    cdn: edge,
    router,
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
    // Stage 6 negative branch: an NX DNS answer renders the refusal card on
    // the browser and no GET ever reaches the server pool (no onFinish).
    onDnsFail: (record) => {
      if (record.from === '10.2') clientBrowser.receiveDnsFailure(record.request);
    },
  });

  return {
    step() {
      tick += 1;
      // TTL eviction happens once per tick, before anything is served:
      // expired entries are gone before this tick's work is priced.
      if (cache) cache.evictExpired(tick);
      // Stage 4+: replication advances one tick at a time.
      if (database) database.stepReplication(tick);
      // Stage 5: worker queue advances jobs and writes to database.
      if (workerQueue) workerQueue.step(database, tick);
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
    // route and serve); 6 in Stage 3 (cache check, then response emit);
    // 7 in Stage 4 (the database hop inserted after the cache check); 8 in
    // Stage 5 (the async worker tail); 9 in Stage 6 for hosted paths (the
    // DNS ask/answer prelude, the stage-5 chain minus its emit hop) and 8
    // for host-less ones; 6 for CDN edge HITs, 9 for CDN MISS and pass
    // through (Stage 6b).
    // `from` is the mini-IP of the browser the trace originates from
    // (default the learner's own 10.2).
    traceHop({ method = 'GET', path = '/about', from = '10.2' } = {}) {
      // CHECKS (Stage 6b): a CDN response frame crosses BACK through the
      // Router into the originating browser, so the browser needs a real
      // resolvable seat on the left network (browser-seat.js).
      if (stage >= 6) ensureBrowserSeat(from);
      const frame = traceMachine.step({ method, path, from });
      if (frame !== null) lastFrame = frame;
      return this.snapshot();
    },

    setUsers(n) {
      userPool.setCount(n);
    },

    // CHECKS: setWebFile routes an fs edit to the server whose address
    // matches — an unknown mini-IP throws (fail-loud over a silent no-op)
    // and nothing else moves (no snapshot-shape change: servers[i].files
    // already carries the fs Map). The edit itself invalidates nothing, so
    // a stage-3+ cache keeps serving its OLD body until the TTL expires.
    setWebFile(address, path, body) {
      const server = servers.find((s) => s.address === address);
      if (!server) {
        throw new Error(`engine: setWebFile — no server at mini-IP ${address}`);
      }
      server.writeFile(path, body);
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
        database: database ? database.snapshot(tick) : null,
        workerQueue: workerQueue ? workerQueue.snapshot(tick) : null,
        dns: dns ? dns.snapshot(tick) : null,
        router: router ? router.snapshot() : null,
        cdn: edge ? edge.snapshot(tick) : null,
        lastMatchedRoute,
        lastFrame,
        browserDisplay: clientBrowser.last(),
        browsers: userPool.getBrowsers(),
        trace: traceMachine.snapshot(),
      };
    },
  };
}
