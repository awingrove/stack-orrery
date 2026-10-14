// DOCUMENTS: the tick loop — each step() advances exactly one discrete
// tick: users emit request events, the server consumes up to its service
// rate and emits response events, then a snapshot is exposed as UI state.
//
// PINS: a fixed seed with a fixed action sequence replays the identical
// tick sequence — pinned by "same seed replays the identical tick sequence"
// in test/sim/engine.test.js.
//
// CHECKS: constructor validates config ranges via its components (seed is
// coerced uint32; arrivalProb must be within [0, 1]).
import { createRng } from './rng.js';
import { createWebServer } from './webserver.js';
import { createUsers } from './users.js';

export function createEngine({ seed = 42, users = 5, serviceRate = 4, arrivalProb = 0.5 } = {}) {
  if (typeof arrivalProb !== 'number' || arrivalProb < 0 || arrivalProb > 1) {
    throw new Error(`engine: arrivalProb must be within [0, 1], got ${arrivalProb}`);
  }
  const rng = createRng(seed);
  const server = createWebServer({ serviceRate });
  const userPool = createUsers({ count: users });
  let tick = 0;

  return {
    step() {
      tick += 1;
      const arrivals = userPool.step(rng, arrivalProb);
      for (const r of arrivals) {
        server.enqueue({ id: `${tick}:${r.userId}`, atTick: tick });
      }
      server.step(tick);
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
        queueDepth,
        served,
        avgLatencyTicks,
      };
    },
  };
}
