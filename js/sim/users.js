// DOCUMENTS: N simulated users — each tick, each user emits at most one
// request with probability `arrivalProb`, drawn from the engine's seeded
// RNG (passed in; this module holds no randomness of its own, so count
// changes stay inside the deterministic action sequence). Each acting user
// owns its own Browser and cycles the slim paths a user might visit.
import { createBrowser } from './browser.js';

const PATHS = ['/', '/about', '/missing'];

export function createUsers({ count = 5, serverAddress = '10.1' } = {}) {
  let n = count;
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`users: count must be a non-negative integer, got ${n}`);
  }
  const browsers = []; // user i uses Browser-(i + 1) at mini-IP 10.(i + 2)

  function browserFor(i) {
    if (!browsers[i]) {
      browsers[i] = createBrowser({ name: `Browser-${i + 1}`, address: `10.${i + 2}` });
    }
    return browsers[i];
  }

  return {
    setCount(next) {
      if (!Number.isInteger(next) || next < 0) {
        throw new Error(`users: count must be a non-negative integer, got ${next}`);
      }
      n = next;
    },
    getCount() {
      return n;
    },
    step(rng, arrivalProb) {
      const requests = [];
      for (let i = 0; i < n; i++) {
        if (rng() < arrivalProb) {
          const browser = browserFor(i);
          const request = browser.createRequest(PATHS[i % PATHS.length]);
          requests.push({ userId: i, from: browser.address, to: serverAddress, request });
        }
      }
      return requests;
    },
  };
}
