// DOCUMENTS: the tick loop — each step() advances exactly one discrete
// tick: users emit request events over the network into the server's
// queue, the server consumes up to its service rate and emits response
// events, then a snapshot is exposed as UI state. The newest served
// exchange is kept in `lastExchange` so the panel can show what actually
// moved on the wire.
//
// PINS: a fixed seed with a fixed action sequence replays the identical
// tick sequence — pinned by "same seed replays the identical tick sequence"
// in test/sim/engine.test.js.
//
// CHECKS: constructor validates config ranges via its components (seed is
// coerced uint32; arrivalProb must be within [0, 1]).
import { createRng } from './rng.js';
import { createNetwork } from './network.js';
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
  const userPool = createUsers({ count: users, serverAddress });
  let tick = 0;
  let lastExchange = null;

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
      if (servedBatch.length > 0) lastExchange = servedBatch[servedBatch.length - 1];
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
      };
    },
  };
}
