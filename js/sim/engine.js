// DOCUMENTS: the tick loop — each step() advances exactly one discrete
// tick: users emit request events over the network into the server's
// queue, the server consumes up to its service rate and emits response
// events, then a snapshot is exposed as UI state. The newest served
// exchange is kept in `lastExchange` so the panel can show what actually
// moved on the wire. `traceHop()` runs the interactive single-request
// trace for the learner's own browser, one hop per call, across the same
// network/queue machinery the crowd uses — It does not fake a shortcut.
//
// PINS: a fixed seed with a fixed action sequence replays the identical
// tick sequence — pinned by "same seed replays the identical tick sequence"
// in test/sim/engine.test.js.
//
// CHECKS: constructor validates config ranges via its components (seed is
// coerced uint32; arrivalProb must be within [0, 1]).
import { createRng } from './rng.js';
import { createNetwork } from './network.js';
import { createBrowser } from './browser.js';
import { createWebServer } from './webserver.js';
import { createUsers } from './users.js';

export function createEngine({
  seed = 42,
  users = 5,
  serviceRate = 4,
  arrivalProb = 0.5,
  serverAddress = '10.1',
} = {}) {
  if (typeof arrivalProb !== 'number' || arrivalProb < 0 || arrivalProb > 1) {
    throw new Error(`engine: arrivalProb must be within [0, 1], got ${arrivalProb}`);
  }
  const rng = createRng(seed);
  const network = createNetwork();
  const server = createWebServer({ address: serverAddress, serviceRate });
  network.registerServer(serverAddress, server);
  // The learner's own interactive client shares the crowd's network and
  // server but keeps its own browser and address; users.js keeps its
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
    request: 'GET /about',
    response: null,
    status: null,
    body: null,
    routeId: null,
  };

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
      const servedBatch = server.step(tick);
      if (servedBatch.length > 0) {
        lastExchange = servedBatch[servedBatch.length - 1];
        lastMatchedRoute = lastExchange.routeId;
        lastFrame = `${lastExchange.from} -> ${lastExchange.to} | ${lastExchange.request} => ${lastExchange.response}`;
        if (servedBatch.some((item) => item.isYou)) {
          for (const item of servedBatch) {
            if (item.isYou) clientBrowser.receiveResponse(item);
          }
        }
      }
      return this.snapshot();
    },

    // One hop per call, 4 hops per request: 1 emit, 2 route, 3 serve,
    // 4 render. Hops 0 and 4 both start a fresh request on the next call.
    traceHop({ method = 'GET', path = '/about' } = {}) {
      if (trace.hop === 0 || trace.hop === 4) {
        const request = clientBrowser.createRequest(path, method);
        trace = {
          hop: 1,
          method,
          path,
          request,
          response: null,
          status: null,
          body: null,
          routeId: null,
        };
        lastFrame = `10.2 -> ${serverAddress} | ${request}`;
      } else if (trace.hop === 1) {
        trace.hop = 2;
        tick += 1;
        network.deliverToQueue({
          id: `you:${tick}`,
          from: '10.2',
          to: serverAddress,
          request: trace.request,
          atTick: tick,
          isYou: true,
        });
        lastFrame = `routed 10.2 -> ${serverAddress} (${trace.request}) into queue`;
      } else if (trace.hop === 2) {
        trace.hop = 3;
        // The learner's request waits FIFO behind crowd items: drain up to
        // serviceRate per move until the `you` request comes back.
        let you;
        for (;;) {
          const batch = server.step(tick);
          you = batch.find((item) => item.isYou);
          if (you || batch.length === 0) break;
        }
        if (you) {
          trace.response = you.response;
          trace.status = you.status;
          trace.body = you.body;
          trace.routeId = you.routeId;
          lastExchange = you;
          lastMatchedRoute = you.routeId;
          lastFrame = `${serverAddress} -> 10.2 | ${you.response}`;
        }
      } else if (trace.hop === 3) {
        trace.hop = 4;
        clientBrowser.receiveResponse({
          from: '10.2',
          to: serverAddress,
          request: trace.request,
          response: trace.response,
        });
      }
      return this.snapshot();
    },

    setUsers(n) {
      userPool.setCount(n);
    },

    snapshot() {
      const { queueDepth, served, avgLatencyTicks } = server.metrics();
      return {
        tick,
        users: userPool.getCount(),
        serverAddress,
        queueDepth,
        served,
        avgLatencyTicks,
        lastExchange,
        queue: server.queueSnapshot(),
        lastMatchedRoute,
        lastFrame,
        browserDisplay: clientBrowser.last(),
        trace: { ...trace },
      };
    },
  };
}
